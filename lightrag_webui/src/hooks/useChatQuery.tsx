import { useCallback, useEffect, useRef, useState } from 'react'
import { throttle } from '@/lib/utils'
import { errorMessage } from '@/lib/utils'
import { queryText, queryTextStream } from '@/api/lightrag'
import { useSettingsStore } from '@/stores/settings'
import { useDebounce } from '@/hooks/useDebounce'
import { ChatMessage as ChatMessageComponent, MessageWithError } from '@/components/retrieval/ChatMessage'
import { CopyIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { copyToClipboard } from '@/utils/clipboard'
import { generateUniqueId, detectLatexCompleteness, parseCOTContent } from '@/utils/chatHelpers'
import type { QueryMode } from '@/api/lightrag'
import Button from '@/components/ui/Button'

export interface UseChatQueryOptions {
  isTabActive: boolean
}

export interface UseChatQueryReturn {
  messages: MessageWithError[]
  inputValue: string
  isLoading: boolean
  statusMessage: string
  inputError: string
  hasMultipleLines: boolean
  messagesContainerRef: React.RefObject<HTMLDivElement | null>
  messagesEndRef: React.RefObject<HTMLDivElement | null>
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  setInputValue: (value: string) => void
  handleChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handlePaste: (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent) => Promise<void>
  clearMessages: () => void
  handleCopyMessage: (message: MessageWithError) => Promise<void>
  scrollToBottom: () => void
  adjustTextareaHeight: (element: HTMLTextAreaElement) => void
  renderMessages: (options?: { compact?: boolean }) => React.ReactNode
}

export const useChatQuery = (options: UseChatQueryOptions): UseChatQueryReturn => {
  const { isTabActive } = options
  const { t } = useTranslation()

  const [messages, setMessages] = useState<MessageWithError[]>(() => {
    try {
      const history = useSettingsStore.getState().retrievalHistory || []
      return history.map((msg, index) => {
        try {
          const msgWithError = msg as MessageWithError
          return {
            ...msg,
            id: msgWithError.id || `hist-${Date.now()}-${index}`,
            mermaidRendered: msgWithError.mermaidRendered ?? true,
            latexRendered: msgWithError.latexRendered ?? true
          }
        } catch {
          return {
            role: 'system' as const,
            content: 'Error loading message',
            id: `error-${Date.now()}-${index}`,
            isError: true,
            mermaidRendered: true
          }
        }
      })
    } catch {
      return []
    }
  })
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')
  const [inputError, setInputError] = useState('')
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  const hasMultipleLines = inputValue.includes('\n')

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setInputValue(e.target.value)
      if (inputError) setInputError('')
    },
    [inputError]
  )

  const adjustTextareaHeight = useCallback((element: HTMLTextAreaElement) => {
    requestAnimationFrame(() => {
      element.style.height = 'auto'
      element.style.height = Math.min(element.scrollHeight, 120) + 'px'
    })
  }, [])

  // Scroll management refs
  const shouldFollowScrollRef = useRef(true)
  const thinkingStartTime = useRef<number | null>(null)
  const thinkingProcessed = useRef(false)
  const isFormInteractionRef = useRef(false)
  const programmaticScrollRef = useRef(false)
  const isReceivingResponseRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    programmaticScrollRef.current = true
    requestAnimationFrame(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
      }
    })
  }, [])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!inputValue.trim() || isLoading) return

      const allowedModes: QueryMode[] = ['naive', 'local', 'global', 'hybrid', 'mix', 'bypass']
      const prefixMatch = inputValue.match(/^\/(\w+)\s+([\s\S]+)/)
      let modeOverride: QueryMode | undefined = undefined
      let actualQuery = inputValue

      if (/^\/\S+/.test(inputValue) && !prefixMatch) {
        setInputError(t('retrievePanel.retrieval.queryModePrefixInvalid'))
        return
      }

      if (prefixMatch) {
        const mode = prefixMatch[1] as QueryMode
        const query = prefixMatch[2]
        if (!allowedModes.includes(mode)) {
          setInputError(
            t('retrievePanel.retrieval.queryModeError', {
              modes: 'naive, local, global, hybrid, mix, bypass'
            })
          )
          return
        }
        modeOverride = mode
        actualQuery = query
      }

      setInputError('')
      thinkingStartTime.current = null
      thinkingProcessed.current = false

      const userMessage: MessageWithError = {
        id: generateUniqueId(),
        content: inputValue,
        role: 'user'
      }

      const assistantMessage: MessageWithError = {
        id: generateUniqueId(),
        content: '',
        role: 'assistant',
        mermaidRendered: false,
        latexRendered: false,
        thinkingTime: null,
        thinkingContent: undefined,
        displayContent: undefined,
        isThinking: false
      }

      const prevMessages = [...messages]
      setMessages([...prevMessages, userMessage, assistantMessage])

      shouldFollowScrollRef.current = true
      isReceivingResponseRef.current = true

      setTimeout(() => {
        scrollToBottom()
      }, 0)

      setInputValue('')
      setIsLoading(true)

      if (inputRef.current && 'style' in inputRef.current) {
        inputRef.current.style.height = '40px'
      }

      const updateAssistantMessage = (chunk: string, isError?: boolean) => {
        assistantMessage.content += chunk

        if (
          assistantMessage.content.includes('<think') &&
          !thinkingStartTime.current
        ) {
          thinkingStartTime.current = Date.now()
        }

        const cotResult = parseCOTContent(assistantMessage.content)
        assistantMessage.isThinking = cotResult.isThinking

        if (cotResult.hasValidThinkBlock && !thinkingProcessed.current) {
          if (thinkingStartTime.current && !assistantMessage.thinkingTime) {
            const duration = (Date.now() - thinkingStartTime.current) / 1000
            assistantMessage.thinkingTime = parseFloat(duration.toFixed(2))
          }
          thinkingProcessed.current = true
        }

        assistantMessage.thinkingContent = cotResult.thinkingContent
        if (cotResult.isThinking) {
          assistantMessage.displayContent = ''
        } else {
          assistantMessage.displayContent = cotResult.displayContent || assistantMessage.content
        }

        const mermaidBlockRegex = /```mermaid\s+([\s\S]+?)```/g
        let mermaidRendered = false
        let match
        while ((match = mermaidBlockRegex.exec(assistantMessage.content)) !== null) {
          if (match[1] && match[1].trim().length > 10) {
            mermaidRendered = true
            break
          }
        }
        assistantMessage.mermaidRendered = mermaidRendered
        assistantMessage.latexRendered = detectLatexCompleteness(assistantMessage.content)

        setMessages((prev) => {
          const newMessages = [...prev]
          const lastMessage = newMessages[newMessages.length - 1]
          if (lastMessage && lastMessage.id === assistantMessage.id) {
            Object.assign(lastMessage, {
              content: assistantMessage.content,
              thinkingContent: assistantMessage.thinkingContent,
              displayContent: assistantMessage.displayContent,
              isThinking: assistantMessage.isThinking,
              isError: isError,
              mermaidRendered: assistantMessage.mermaidRendered,
              latexRendered: assistantMessage.latexRendered,
              thinkingTime: assistantMessage.thinkingTime
            })
          }
          return newMessages
        })

        if (shouldFollowScrollRef.current) {
          setTimeout(() => {
            scrollToBottom()
          }, 30)
        }
      }

      // Prepare query parameters
      const state = useSettingsStore.getState()

      if (state.querySettings.user_prompt && state.querySettings.user_prompt.trim()) {
        state.addUserPromptToHistory(state.querySettings.user_prompt.trim())
      }

      const effectiveMode = modeOverride || state.querySettings.mode
      const configuredHistoryTurns = state.querySettings.history_turns || 0
      const effectiveHistoryTurns =
        effectiveMode === 'bypass' && configuredHistoryTurns === 0
          ? 3
          : configuredHistoryTurns

      const queryParams = {
        ...state.querySettings,
        query: actualQuery,
        response_type: 'Multiple Paragraphs',
        conversation_history:
          effectiveHistoryTurns > 0
            ? prevMessages
              .filter((m) => m.isError !== true)
              .slice(-effectiveHistoryTurns * 2)
              .map((m) => ({ role: m.role, content: m.content }))
            : [],
        ...(modeOverride ? { mode: modeOverride } : {})
      }

      try {
        if (state.querySettings.stream) {
          let errorMsg = ''
          await queryTextStream(
            queryParams,
            (chunk) => {
              setStatusMessage('')
              updateAssistantMessage(chunk)
            },
            (error) => {
              errorMsg += error
            },
            (status, message) => {
              setStatusMessage(message || status)
            }
          )
          if (errorMsg) {
            if (assistantMessage.content) {
              errorMsg = assistantMessage.content + '\n' + errorMsg
            }
            updateAssistantMessage(errorMsg, true)
          }
        } else {
          const response = await queryText(queryParams)
          updateAssistantMessage(response.response)
        }
      } catch (err) {
        updateAssistantMessage(`${t('retrievePanel.retrieval.error')}\n${errorMessage(err)}`, true)
      } finally {
        setIsLoading(false)
        setStatusMessage('')
        isReceivingResponseRef.current = false

        try {
          const finalCotResult = parseCOTContent(assistantMessage.content)
          assistantMessage.isThinking = false

          if (
            finalCotResult.hasValidThinkBlock &&
            thinkingStartTime.current &&
            !assistantMessage.thinkingTime
          ) {
            const duration = (Date.now() - thinkingStartTime.current) / 1000
            assistantMessage.thinkingTime = parseFloat(duration.toFixed(2))
          }

          if (finalCotResult.displayContent !== undefined) {
            assistantMessage.displayContent = finalCotResult.displayContent
          }
        } catch {
          assistantMessage.isThinking = false
        } finally {
          thinkingStartTime.current = null
        }

        try {
          useSettingsStore
            .getState()
            .setRetrievalHistory([...prevMessages, userMessage, assistantMessage])
        } catch (error) {
          console.error('Error saving retrieval history:', error)
        }
      }
    },
    [inputValue, isLoading, messages, t, scrollToBottom]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        const target = e.target as HTMLInputElement | HTMLTextAreaElement
        const start = target.selectionStart || 0
        const end = target.selectionEnd || 0
        const newValue = inputValue.slice(0, start) + '\n' + inputValue.slice(end)
        setInputValue(newValue)

        setTimeout(() => {
          if (target.setSelectionRange) {
            target.setSelectionRange(start + 1, start + 1)
          }
          if (inputRef.current && inputRef.current.tagName === 'TEXTAREA') {
            adjustTextareaHeight(inputRef.current as HTMLTextAreaElement)
          }
        }, 0)
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit(e as any)
      }
    },
    [inputValue, handleSubmit, adjustTextareaHeight]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const pastedText = e.clipboardData.getData('text')
      if (pastedText.includes('\n')) {
        e.preventDefault()
        const target = e.target as HTMLInputElement | HTMLTextAreaElement
        const start = target.selectionStart || 0
        const end = target.selectionEnd || 0
        const newValue = inputValue.slice(0, start) + pastedText + inputValue.slice(end)
        setInputValue(newValue)

        setTimeout(() => {
          if (inputRef.current && inputRef.current.setSelectionRange) {
            const newCursorPosition = start + pastedText.length
            inputRef.current.setSelectionRange(newCursorPosition, newCursorPosition)
          }
        }, 0)
      }
    },
    [inputValue]
  )

  // Focus management on component switch
  useEffect(() => {
    if (inputRef.current) {
      const currentElement = inputRef.current
      const cursorPosition = currentElement.selectionStart || inputValue.length
      requestAnimationFrame(() => {
        currentElement.focus()
        if (currentElement.setSelectionRange) {
          currentElement.setSelectionRange(cursorPosition, cursorPosition)
        }
      })
    }
  }, [hasMultipleLines, inputValue.length])

  // Adjust textarea height on switch
  useEffect(() => {
    if (hasMultipleLines && inputRef.current && inputRef.current.tagName === 'TEXTAREA') {
      adjustTextareaHeight(inputRef.current as HTMLTextAreaElement)
    }
  }, [hasMultipleLines, inputValue, adjustTextareaHeight])

  // Cleanup
  useEffect(() => {
    return () => {
      if (thinkingStartTime.current) {
        thinkingStartTime.current = null
      }
    }
  }, [])

  // Scroll event listeners
  useEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return

    const handleWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > 10 && !isFormInteractionRef.current) {
        shouldFollowScrollRef.current = false
      }
    }

    const handleScroll = throttle(() => {
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false
        return
      }
      const cont = messagesContainerRef.current
      if (cont) {
        const isAtBottom = cont.scrollHeight - cont.scrollTop - cont.clientHeight < 20
        if (isAtBottom) {
          shouldFollowScrollRef.current = true
        } else if (!isFormInteractionRef.current && !isReceivingResponseRef.current) {
          shouldFollowScrollRef.current = false
        }
      }
    }, 30)

    container.addEventListener('wheel', handleWheel as EventListener)
    container.addEventListener('scroll', handleScroll as EventListener)

    return () => {
      container.removeEventListener('wheel', handleWheel as EventListener)
      container.removeEventListener('scroll', handleScroll as EventListener)
    }
  }, [])

  // Form interaction tracking
  useEffect(() => {
    const form = document.querySelector('form')
    if (!form) return

    const handleFormMouseDown = () => {
      isFormInteractionRef.current = true
      setTimeout(() => {
        isFormInteractionRef.current = false
      }, 500)
    }

    form.addEventListener('mousedown', handleFormMouseDown)
    return () => {
      form.removeEventListener('mousedown', handleFormMouseDown)
    }
  }, [])

  // Auto-scroll on messages change
  const debouncedMessages = useDebounce(messages, 150)
  useEffect(() => {
    if (shouldFollowScrollRef.current) {
      scrollToBottom()
    }
  }, [debouncedMessages, scrollToBottom])

  const clearMessages = useCallback(() => {
    setMessages([])
    useSettingsStore.getState().setRetrievalHistory([])
  }, [])

  const handleCopyMessage = useCallback(
    async (message: MessageWithError) => {
      const contentToCopy =
        message.role === 'user'
          ? message.content || ''
          : message.displayContent !== undefined
            ? message.displayContent
            : message.content || ''

      if (!contentToCopy.trim()) {
        toast.error(t('retrievePanel.chatMessage.copyEmpty', 'No content to copy'))
        return
      }

      try {
        const result = await copyToClipboard(contentToCopy)
        if (result.success) {
          const methodMessages: Record<string, string> = {
            'clipboard-api': t('retrievePanel.chatMessage.copySuccess', 'Content copied'),
            execCommand: t('retrievePanel.chatMessage.copySuccessLegacy', 'Content copied'),
            'manual-select': t('retrievePanel.chatMessage.copySuccessManual', 'Content copied'),
            fallback: t('retrievePanel.chatMessage.copySuccess', 'Content copied')
          }
          toast.success(
            methodMessages[result.method] || t('retrievePanel.chatMessage.copySuccess', 'Content copied')
          )
        } else {
          toast.error(
            result.error || t('retrievePanel.chatMessage.copyFailed', 'Failed to copy content')
          )
        }
      } catch (err) {
        console.error('Clipboard operation failed:', err)
        toast.error(t('retrievePanel.chatMessage.copyError', 'Copy operation failed'))
      }
    },
    [t]
  )

  const renderMessages = useCallback(
    (renderOptions?: { compact?: boolean }) => {
      const { compact = false } = renderOptions || {}

      if (messages.length === 0) {
        return (
          <div className="text-muted-foreground flex h-full items-center justify-center text-lg">
            {t('retrievePanel.retrieval.startPrompt')}
          </div>
        )
      }

      return (
        <>
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} ${compact ? 'gap-1' : 'items-end gap-2'}`}
            >
              {message.role === 'user' && !compact && (
                <Button
                  onClick={() => handleCopyMessage(message)}
                  className="mb-2 size-6 rounded-md opacity-60 transition-opacity hover:opacity-100 shrink-0"
                  tooltip={t('retrievePanel.chatMessage.copyTooltip')}
                  variant="ghost"
                  size="icon"
                >
                  <CopyIcon className="size-4" />
                </Button>
              )}
              <ChatMessageComponent message={message} isTabActive={isTabActive} />
              {message.role === 'assistant' && !compact && (
                <Button
                  onClick={() => handleCopyMessage(message)}
                  className="mb-2 size-6 rounded-md opacity-60 transition-opacity hover:opacity-100 shrink-0"
                  tooltip={t('retrievePanel.chatMessage.copyTooltip')}
                  variant="ghost"
                  size="icon"
                >
                  <CopyIcon className="size-4" />
                </Button>
              )}
            </div>
          ))}
          {statusMessage && (
            <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {statusMessage}
            </div>
          )}
        </>
      )
    },
    [messages, isTabActive, handleCopyMessage, t, statusMessage]
  )

  return {
    messages,
    inputValue,
    isLoading,
    statusMessage,
    inputError,
    hasMultipleLines,
    messagesContainerRef,
    messagesEndRef,
    inputRef,
    setInputValue,
    handleChange,
    handleKeyDown,
    handlePaste,
    handleSubmit,
    clearMessages,
    handleCopyMessage,
    scrollToBottom,
    adjustTextareaHeight,
    renderMessages
  }
}

import { useState, useCallback } from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/Select'
import { useChatQuery } from '@/hooks/useChatQuery'
import { useSettingsStore } from '@/stores/settings'
import { controlButtonVariant } from '@/lib/constants'
import { MessageCircleIcon, XIcon, SendIcon, EraserIcon, Settings2Icon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/Popover'
import type { QueryMode } from '@/api/lightrag'

const queryModes: { value: QueryMode; label: string }[] = [
  { value: 'naive', label: 'Naive' },
  { value: 'local', label: 'Local' },
  { value: 'global', label: 'Global' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'mix', label: 'Mix' }
]

const GraphChatPanel = () => {
  const { t } = useTranslation()
  const [isOpen, setIsOpen] = useState(false)

  const currentTab = useSettingsStore.use.currentTab()
  const isGraphTabActive = currentTab === 'knowledge-graph'
  const querySettings = useSettingsStore.use.querySettings()
  const updateQuerySettings = useSettingsStore.use.updateQuerySettings()

  const {
    inputValue,
    isLoading,
    inputError,
    messagesContainerRef,
    messagesEndRef,
    inputRef,
    handleChange,
    handleSubmit,
    clearMessages,
    renderMessages
  } = useChatQuery({ isTabActive: isGraphTabActive })

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleChange(e)
    },
    [handleChange]
  )

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSubmit(e as any)
      }
    },
    [handleSubmit]
  )

  if (!isOpen) {
    return (
      <div className="absolute bottom-16 right-4 z-20">
        <Button
          variant="outline"
          onClick={() => setIsOpen(true)}
          tooltip={t('graphPanel.chatPanel.openChat')}
          className="bg-primary/90 hover:bg-primary text-primary-foreground hover:text-primary-foreground backdrop-blur-lg shadow-lg size-11 rounded-full"
        >
          <MessageCircleIcon className="size-5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-2 right-2 z-20 flex flex-col w-[420px] h-[520px] bg-background/80 backdrop-blur-lg rounded-xl border-2 shadow-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-sm font-medium">{t('graphPanel.chatPanel.title')}</span>
        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7">
                <Settings2Icon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2" side="top" align="end">
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  {t('graphPanel.chatPanel.queryMode')}
                </label>
                <Select
                  value={querySettings.mode}
                  onValueChange={(value) =>
                    updateQuerySettings({ mode: value as QueryMode })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {queryModes.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={clearMessages}
            disabled={isLoading}
          >
            <EraserIcon className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setIsOpen(false)}>
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-auto p-2 flex flex-col gap-2 min-h-0"
      >
        {renderMessages({ compact: true })}
        <div ref={messagesEndRef} className="pb-1" />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 px-2 py-2 border-t shrink-0"
      >
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          placeholder={t('retrievePanel.retrieval.placeholder')}
          disabled={isLoading}
          className="flex-1 h-8 text-sm"
        />
        <Button type="submit" size="icon" disabled={isLoading || !inputValue.trim()} className="size-8">
          <SendIcon className="size-4" />
        </Button>
      </form>

      {/* Input error */}
      {inputError && (
        <div className="px-2 pb-1 text-xs text-red-500">{inputError}</div>
      )}
    </div>
  )
}

export default GraphChatPanel

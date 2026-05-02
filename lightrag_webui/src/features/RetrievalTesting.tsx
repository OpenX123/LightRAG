import Textarea from '@/components/ui/Textarea'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import QuerySettings from '@/components/retrieval/QuerySettings'
import { useChatQuery } from '@/hooks/useChatQuery'
import { useSettingsStore } from '@/stores/settings'
import { EraserIcon, SendIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function RetrievalTesting() {
  const { t } = useTranslation()
  const currentTab = useSettingsStore.use.currentTab()
  const isRetrievalTabActive = currentTab === 'retrieval'

  const {
    inputValue,
    isLoading,
    inputError,
    hasMultipleLines,
    messagesContainerRef,
    messagesEndRef,
    inputRef,
    handleChange,
    handleKeyDown,
    handlePaste,
    handleSubmit,
    clearMessages,
    renderMessages
  } = useChatQuery({ isTabActive: isRetrievalTabActive })

  return (
    <div className="flex size-full gap-2 px-2 pb-12 overflow-hidden">
      <div className="flex grow flex-col gap-4">
        <div className="relative grow">
          <div
            ref={messagesContainerRef}
            className="bg-primary-foreground/60 absolute inset-0 flex flex-col overflow-auto rounded-lg border p-2"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {renderMessages()}
              <div ref={messagesEndRef} className="pb-1" />
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex shrink-0 items-center gap-2"
          autoComplete="on"
          method="post"
          action="#"
          role="search"
        >
          <input type="submit" style={{ display: 'none' }} tabIndex={-1} />
          <Button
            type="button"
            variant="outline"
            onClick={clearMessages}
            disabled={isLoading}
            size="sm"
          >
            <EraserIcon />
            {t('retrievePanel.retrieval.clear')}
          </Button>
          <div className="flex-1 relative">
            <label htmlFor="query-input" className="sr-only">
              {t('retrievePanel.retrieval.placeholder')}
            </label>
            {hasMultipleLines ? (
              <Textarea
                ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                id="query-input"
                autoComplete="on"
                className="w-full min-h-[40px] max-h-[120px] overflow-y-auto"
                value={inputValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t('retrievePanel.retrieval.placeholder')}
                disabled={isLoading}
                rows={1}
                style={{
                  resize: 'none',
                  height: 'auto',
                  minHeight: '40px',
                  maxHeight: '120px'
                }}
                onInput={(e: React.FormEvent<HTMLTextAreaElement>) => {
                  const target = e.target as HTMLTextAreaElement
                  requestAnimationFrame(() => {
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 120) + 'px'
                  })
                }}
              />
            ) : (
              <Input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                id="query-input"
                autoComplete="on"
                className="w-full"
                value={inputValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t('retrievePanel.retrieval.placeholder')}
                disabled={isLoading}
              />
            )}
            {inputError && (
              <div className="absolute left-0 top-full mt-1 text-xs text-red-500">{inputError}</div>
            )}
          </div>
          <Button type="submit" variant="default" disabled={isLoading} size="sm">
            <SendIcon />
            {t('retrievePanel.retrieval.send')}
          </Button>
        </form>
      </div>
      <QuerySettings />
    </div>
  )
}

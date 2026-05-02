// Helper function to generate unique IDs with browser compatibility
export const generateUniqueId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `id-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

// LaTeX completeness detection function
export const detectLatexCompleteness = (content: string): boolean => {
  const blockLatexMatches = content.match(/\$\$/g) || []
  const hasUnclosedBlock = blockLatexMatches.length % 2 !== 0

  const contentWithoutBlocks = content.replace(/\$\$[\s\S]*?\$\$/g, '')
  const inlineLatexMatches = contentWithoutBlocks.match(/(?<!\$)\$(?!\$)/g) || []
  const hasUnclosedInline = inlineLatexMatches.length % 2 !== 0

  return !hasUnclosedBlock && !hasUnclosedInline
}

// Robust COT parsing function to handle multiple think blocks and edge cases
export const parseCOTContent = (content: string) => {
  const thinkStartTag = '<think\\>'
  const thinkEndTag = '</think\\>'

  const startMatches: number[] = []
  const endMatches: number[] = []

  let startIndex = 0
  while ((startIndex = content.indexOf(thinkStartTag, startIndex)) !== -1) {
    startMatches.push(startIndex)
    startIndex += thinkStartTag.length
  }

  let endIndex = 0
  while ((endIndex = content.indexOf(thinkEndTag, endIndex)) !== -1) {
    endMatches.push(endIndex)
    endIndex += thinkEndTag.length
  }

  const hasThinkStart = startMatches.length > 0
  const hasThinkEnd = endMatches.length > 0
  const isThinking = hasThinkStart && startMatches.length > endMatches.length

  let thinkingContent = ''
  let displayContent = content

  if (hasThinkStart) {
    if (hasThinkEnd && startMatches.length === endMatches.length) {
      const lastStartIndex = startMatches[startMatches.length - 1]
      const lastEndIndex = endMatches[endMatches.length - 1]

      if (lastEndIndex > lastStartIndex) {
        thinkingContent = content
          .substring(lastStartIndex + thinkStartTag.length, lastEndIndex)
          .trim()
        displayContent = content.substring(lastEndIndex + thinkEndTag.length).trim()
      }
    } else if (isThinking) {
      const lastStartIndex = startMatches[startMatches.length - 1]
      thinkingContent = content.substring(lastStartIndex + thinkStartTag.length)
      displayContent = ''
    }
  }

  return {
    isThinking,
    thinkingContent,
    displayContent,
    hasValidThinkBlock: hasThinkStart && hasThinkEnd && startMatches.length === endMatches.length
  }
}

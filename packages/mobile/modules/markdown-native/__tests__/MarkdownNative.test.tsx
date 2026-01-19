import React from 'react'
import { render, screen } from '@testing-library/react-native'
import MarkdownNative from '../src/MarkdownNative'

describe('MarkdownNative', () => {
  it('renders simple text', () => {
    render(<MarkdownNative>Hello world</MarkdownNative>)
    expect(screen.queryByText('Hello world')).toBeTruthy()
  })

  it('renders headings', () => {
    render(
      <MarkdownNative>
        # Heading 1
        ## Heading 2
      </MarkdownNative>
    )
    expect(screen.queryByText('Heading 1')).toBeTruthy()
    expect(screen.queryByText('Heading 2')).toBeTruthy()
  })

  it('renders bold text', () => {
    render(<MarkdownNative>This is **bold** text</MarkdownNative>)
    expect(screen.queryByText('This is bold text')).toBeTruthy()
  })

  it('renders italic text', () => {
    render(<MarkdownNative>This is *italic* text</MarkdownNative>)
    expect(screen.queryByText('This is italic text')).toBeTruthy()
  })

  it('renders inline code', () => {
    render(<MarkdownNative>{'This is `code` text'}</MarkdownNative>)
    expect(screen.queryByText('code')).toBeTruthy()
  })

  it('renders code blocks', () => {
    const markdown = '```javascript\nconst x = 1\n```'
    render(<MarkdownNative>{markdown}</MarkdownNative>)
    expect(screen.queryByText('const x = 1')).toBeTruthy()
  })

  it('renders lists', () => {
    const markdown = '- Item 1\n- Item 2\n- Item 3'
    render(<MarkdownNative>{markdown}</MarkdownNative>)
    expect(screen.queryByText('Item 1')).toBeTruthy()
    expect(screen.queryByText('Item 2')).toBeTruthy()
    expect(screen.queryByText('Item 3')).toBeTruthy()
  })

  it('renders links', () => {
    render(
      <MarkdownNative>
        [OpenAI](https://openai.com)
      </MarkdownNative>
    )
    expect(screen.queryByText('OpenAI')).toBeTruthy()
  })

  it('renders blockquotes', () => {
    render(
      <MarkdownNative>
        > This is a quote
      </MarkdownNative>
    )
    expect(screen.queryByText('This is a quote')).toBeTruthy()
  })

  it('handles empty content', () => {
    const { container } = render(<MarkdownNative></MarkdownNative>)
    expect(container).toBeTruthy()
  })

  it('handles complex markdown with multiple features', () => {
    const markdown = '# Welcome to OpenCode\n\nThis is a **chat interface** with *native* markdown rendering.\n\n## Features\n\n- Code highlighting\n- Fast performance\n- Beautiful UI\n\n> Quote: This project is amazing!\n\n[Learn more](https://opencode.ai)'

    render(<MarkdownNative>{markdown}</MarkdownNative>)
    expect(screen.queryByText('Welcome to OpenCode')).toBeTruthy()
    expect(screen.queryByText('This is a chat interface')).toBeTruthy()
    expect(screen.queryByText('Features')).toBeTruthy()
    expect(screen.queryByText('Code highlighting')).toBeTruthy()
    expect(screen.queryByText('Fast performance')).toBeTruthy()
    expect(screen.queryByText('Quote: This project is amazing!')).toBeTruthy()
    expect(screen.queryByText('Learn more')).toBeTruthy()
  })

  it('respects selectable prop', () => {
    render(
      <MarkdownNative selectable={false}>
        Selectable text
      </MarkdownNative>
    )
    expect(screen.queryByText('Selectable text')).toBeTruthy()
  })

  it('applies custom styles', () => {
    const customStyles = {
      body: { fontSize: 20, color: '#FF0000' },
      heading1: { fontSize: 32 }
    }
    
    render(
      <MarkdownNative style={customStyles}>
        # Styled Heading
        Body text
      </MarkdownNative>
    )
    
    expect(screen.queryByText('Styled Heading')).toBeTruthy()
    expect(screen.queryByText('Body text')).toBeTruthy()
  })

  it('handles multiple line breaks', () => {
    const markdown = 'Line 1\n\nLine 2\n\n\nLine 3'
    render(<MarkdownNative>{markdown}</MarkdownNative>)
    expect(screen.queryByText('Line 1')).toBeTruthy()
    expect(screen.queryByText('Line 2')).toBeTruthy()
    expect(screen.queryByText('Line 3')).toBeTruthy()
  })

  it('renders nested formatting', () => {
    const markdown = 'This is ***bold and italic***'
    render(<MarkdownNative>{markdown}</MarkdownNative>)
    expect(screen.queryByText('This is bold and italic')).toBeTruthy()
  })

  it('renders ordered lists', () => {
    const markdown = '1. First\n2. Second\n3. Third'
    render(<MarkdownNative>{markdown}</MarkdownNative>)
    expect(screen.queryByText('First')).toBeTruthy()
    expect(screen.queryByText('Second')).toBeTruthy()
    expect(screen.queryByText('Third')).toBeTruthy()
  })

  it('renders horizontal rules', () => {
    const markdown = 'Above\n---\nBelow'
    render(<MarkdownNative>{markdown}</MarkdownNative>)
    expect(screen.queryByText('Above')).toBeTruthy()
    expect(screen.queryByText('Below')).toBeTruthy()
  })
})

Pod::Spec.new do |s|
  s.name           = 'MarkdownNative'
  s.version        = '1.0.0'
  s.summary        = 'Native markdown rendering for React Native using cmark'
  s.description    = 'Native markdown rendering module for React Native with Drop-in replacement for react-native-markdown-display'
  s.author         = 'OpenCode'
  s.homepage       = 'https://github.com/opencode'
  s.platform       = :ios, '13.0'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'Down', '~> 0.11.0'

  s.swift_version = '5.5'
  s.source_files = "**/*.{h,m,swift}"
end

export const SAMPLES = [
  { id: 1, kind: "Word", text: "Hello" },
  { id: 2, kind: "Word", text: "Supercalifragilisticexpialidocious" },
  { id: 3, kind: "Sentence", text: "The quick brown fox jumps over the lazy dog." },
  { id: 4, kind: "Sentence", text: "Tokens are the basic units of text that a language model reads and writes." },
  { id: 5, kind: "Code", text: "const sum = (a, b) => a + b;\nconsole.log(sum(2, 3));" },
  { id: 6, kind: "Non-English", text: "こんにちは世界！今日はいい天気ですね。" },
  {
    id: 7,
    kind: "Paragraph",
    text: "Large language models do not read text character by character. Instead, text is split into tokens, which may be whole words, parts of words, or punctuation. Knowing how many tokens a prompt uses helps you estimate cost and stay within the model's context window.",
  },
];

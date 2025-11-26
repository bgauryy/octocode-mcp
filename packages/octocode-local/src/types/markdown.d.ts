// Type declaration for importing markdown files as strings
declare module '*.md' {
  const content: string;
  export default content;
}

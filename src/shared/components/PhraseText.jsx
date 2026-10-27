// Keep short clauses together; a long clause can still wrap on narrow screens.
export default function PhraseText({ children }) {
  if (typeof children !== 'string') return children;
  return (children.match(/[^，。；：！？]+[，。；：！？]?/g) || [children]).map((phrase, index) =>
    <span className="platform-text-phrase" key={index}>{phrase}</span>);
}

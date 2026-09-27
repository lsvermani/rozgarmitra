import { LANGUAGES, useLanguage } from '../context/useLanguage';
import LiveLocation from './LiveLocation';

export default function LanguageTabs({ showLocation = true }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="rm-lang-widget">
      <div className="rm-language-tabs" aria-label="Language selection">
        {LANGUAGES.map((item) => (
          <button key={item.code} className={language === item.code ? 'active' : ''} onClick={() => setLanguage(item.code)}>
            {item.label}
          </button>
        ))}
      </div>
      {showLocation && <LiveLocation />}
    </div>
  );
}
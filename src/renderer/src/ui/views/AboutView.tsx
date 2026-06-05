import type { JSX } from 'react';
import { Bot, Cpu, Headphones, HelpCircle, Mic, ShieldCheck, Sparkles, UserRound } from 'lucide-react';

export const AboutView = (): JSX.Element => (
  <section className="page about-page">
    <div className="page-heading">
      <div>
        <h1>About</h1>
      </div>
    </div>
    <div className="about-intro">
      <div className="about-intro-icon">
        <Mic size={24} />
      </div>
      <div>
        <h2>Built to avoid typing</h2>
        <p>
          Speaking is much faster than typing. Voclyra turns speech into text locally with Whisper, copies it to your clipboard, and keeps the workflow fast on your Windows PC.
        </p>
      </div>
    </div>
    <div className="about-faq" aria-label="About Voclyra">
      <article>
        <h2>
          <HelpCircle size={18} />
          What is Voclyra for?
        </h2>
        <p>It is a compact assistant for dictating instead of typing, so you can capture ideas, messages, and notes with less friction.</p>
      </article>
      <article>
        <h2>
          <Sparkles size={18} />
          Why does it exist?
        </h2>
        <p>Writing by hand is slow. Voclyra makes speech-to-text the default path while keeping everything local and available from shortcuts or the tray.</p>
      </article>
      <article>
        <h2>
          <Bot size={18} />
          How does improvement work?
        </h2>
        <p>Voclyra reads selected text when possible. If nothing is selected, it uses the text currently copied to your clipboard, then improves it with your local Ollama model.</p>
      </article>
      <article>
        <h2>
          <Headphones size={18} />
          What is Transcript?
        </h2>
        <p>Transcript records longer conversations and sends the captured audio to local Whisper so you can copy the meeting text afterward.</p>
      </article>
      <article>
        <h2>
          <ShieldCheck size={18} />
          What stays local?
        </h2>
        <p>Dictation uses local Whisper models and text improvement uses Ollama on your machine. Core processing does not require a remote API.</p>
      </article>
    </div>
    <dl className="about-list">
      <div>
        <dt>
          <UserRound size={17} />
          Creator
        </dt>
        <dd>timtim</dd>
      </div>
      <div>
        <dt>
          <Cpu size={17} />
          Version
        </dt>
        <dd>0.1.0</dd>
      </div>
      <div>
        <dt>
          <ShieldCheck size={17} />
          Processing
        </dt>
        <dd>Local Whisper, Transcript, and Ollama</dd>
      </div>
    </dl>
  </section>
);

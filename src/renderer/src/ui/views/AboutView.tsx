import type { JSX } from 'react';
import { Bot, Headphones, Info, Mic, ShieldCheck, Wand2, Zap } from 'lucide-react';
import { packageInfo } from '@shared/GlobalVars';

export const AboutView = (): JSX.Element => (
  <section className="page about-page">
    <div className="page-heading">
      <div>
        <h1 className="view-title">
          <Info size={21} />
          <span>About</span>
        </h1>
        <p className="page-subtitle">
          {packageInfo.productName} is built around shortcuts, voice capture, and local AI to make writing workflows faster.
        </p>
      </div>
    </div>

    <div className="about-faq" aria-label={`About ${packageInfo.productName}`}>
      <article>
        <h2>
          <Zap size={18} />
          Why {packageInfo.productName} exists
        </h2>
        <p>
          Typing is slow compared to speaking. {packageInfo.productName} helps you capture ideas, notes, and messages faster by turning voice into usable text from quick shortcuts.
        </p>
      </article>

      <article>
        <h2>
          <Mic size={18} />
          Speak
        </h2>
        <p>
          Speak is made for short voice captures. Use a shortcut, talk naturally, and get text copied quickly so you can paste it back into the app, chat, document, or input you were using.
        </p>
      </article>

      <article>
        <h2>
          <Headphones size={18} />
          Transcript
        </h2>
        <p>
          Transcript is made for longer captures, such as meetings, notes, or conversations. It keeps the transcript local, then lets you send it to a larger LLM for a short summary.
        </p>
      </article>

      <article>
        <h2>
          <Wand2 size={18} />
          Improve
        </h2>
        <p>
          Improve gives you one shortcut to correct spelling, grammar, and badly phrased sentences without jumping between tools. It helps you clean up text faster and stay productive.
        </p>
      </article>

      <article>
        <h2>
          <Bot size={18} />
          Local AI
        </h2>
        <p>
          Whisper handles speech-to-text locally, while the local AI runtime improves text on your machine. Core processing does not require a remote API.
        </p>
      </article>

      <article>
        <h2>
          <ShieldCheck size={18} />
          Privacy
        </h2>
        <p>
          Speak, transcription, and improvement are designed to run locally, keeping your main workflow private, fast, and under your control.
        </p>
      </article>
    </div>
  </section>
);

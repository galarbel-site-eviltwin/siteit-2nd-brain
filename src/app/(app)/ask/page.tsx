import { Microphone, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { BrainAnim } from "@/components/brain/brain-anim";
import { requireEmployee } from "@/lib/session";

export default async function Ask() {
  await requireEmployee();
  return (
    <>
      <section className="brain-hero ask-hero">
        <BrainAnim label="המוח של סייט איט" />
        <div className="ask-hero-copy">
          <h1>שאל את המוח</h1>
          <p>כל שאלה על לקוח, פגישה או החלטה, עם מקור לכל תשובה.</p>
        </div>
      </section>
      <form className="ask-box" aria-disabled="true">
        <Sparkle size={28} weight="duotone" />
        <label className="sr-only" htmlFor="q">שאלה למוח</label>
        <input id="q" disabled placeholder="המוח עוד לומד. השאלות ייפתחו בשלב 2, אחרי שנקלוט את הפגישות הראשונות" />
        <button type="button" disabled aria-label="שאלה בקול"><Microphone size={24} /></button>
      </form>
    </>
  );
}

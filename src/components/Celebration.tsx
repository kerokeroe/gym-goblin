// Full-screen "NEW PR!" moment: pixel confetti bursts out from behind the
// goblin. Closes on tap, Escape, or after a few seconds.
import { useEffect } from 'react';
import { Goblin } from './Goblin.tsx';

export type CelebrationInfo = { exercise: string; label: string; xp: number };

const COLORS = ['#B8FF3C', '#FF4FD8', '#FFE14D', '#7BE0FF'];
// 24 confetti pixels on a circle; each flies out along its own angle (CSS vars).
const PIECES = Array.from({ length: 24 }, (_, i) => {
  const angle = (i / 24) * Math.PI * 2;
  const dist = 120 + (i % 3) * 40;
  return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist, color: COLORS[i % COLORS.length], delay: (i % 4) * 40 };
});

export function Celebration({ info, onClose }: { info: CelebrationInfo; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4500);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="celebration" role="alertdialog" aria-label={`New personal record: ${info.exercise} ${info.label}`} onClick={onClose}>
      <div className="burst" aria-hidden="true">
        {PIECES.map((p, i) => (
          <span
            key={i}
            className="confetti"
            style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, background: p.color, animationDelay: `${p.delay}ms` } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="celebration-card">
        <Goblin mood="cheer" size={132} />
        <p className="pixel celebration-title">NEW PR!</p>
        <p className="celebration-set">
          {info.exercise} <strong>{info.label}</strong>
        </p>
        <p className="pixel xp">+{info.xp} XP</p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          NICE
        </button>
      </div>
    </div>
  );
}

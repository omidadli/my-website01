import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { mascot } from './mascotBus';
import { soulJourney } from './soul';
import { MascotCue } from './useMascotEvents';
import { VIDEO_SCENES, MascotVisualStep, videoSrc } from './mascotVideos';
import { useMascotLookAt } from './useMascotLookAt';
import sprites from './sprites.json';

/** `play()` returns a Promise in modern browsers but `undefined` in old WebViews/jsdom — never let that throw. */
const safePlay = (el: HTMLVideoElement) => {
  try {
    const p = el.play();
    if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => undefined);
  } catch {
    /* autoplay blocked or element detached */
  }
};
export { useMascotLookAt } from './useMascotLookAt';

/**
 * Mascot figure — the living character.
 *
 * Head & Eye tracking: powered by `useMascotLookAt` hook. Instead of static
 * overlays, the whole figure turns toward the cursor in fake-3D — perspective
 * rotateY / rotateX around the neck pivot (transform-origin 50% 88%), plus a
 * subtle body follow-translate and multi-plane eye/face parallax. With no mouse
 * for a few seconds he slowly glances around on his own, like someone thinking.
 *
 * Periodic Natural Eye Blinking:
 * To mimic natural human behavior, a dedicated blinking loop schedules blinks
 * at realistic, randomized intervals (typically 2.8s to 6.2s, with occasional
 * natural double-blinks). During each blink, eyelid overlays cover the eyes for
 * ~110-140ms with a quick 35ms close and 65ms open curve. Eyelid positions adapt
 * dynamically to the current scene's eye coordinates from `sprites.json`.
 *
 * Acting: the bus scene is rendered as VIDEO layers — a looping/one-shot
 * <video> per state (see mascotVideos.ts) inside a rounded "avatar screen".
 * Transitions are a 320ms crossfade: the incoming layer mounts at opacity 0
 * under/over the outgoing one, starts at frame 0, and only fades in once its
 * first frame is decodable — the outgoing video keeps playing underneath, so
 * a slow first fetch never flashes blank. After the fade the old element is
 * unmounted (key hand-over) to release its decoder.
 *
 * Looping videos do NOT use the native `loop` attribute: on `ended` a fresh
 * copy of the same video crossfades in (self-crossfade), so the loop cut is
 * masked even when the clip's last frame ≠ first frame. One-shot videos play
 * once, hold their last frame, and yield to the bus's next state (idle or the
 * hold/then choreography soul.ts already scheduled).
 *
 * Used twice: corner widget + chat video bar, always in sync via the bus.
 */

type SpriteMeta = { src: string; w: number; h: number; eyes: { cx: number; cy: number; r: number }[] | null };
const META = sprites as unknown as Record<string, SpriteMeta>;

const FADE_MS = 320; // crossfade budget (250–400ms per spec)

interface Layer {
  key: number;
  step: MascotVisualStep;
}

const posterOf = (step: MascotVisualStep): string | undefined =>
  step.poster && META[step.poster] ? META[step.poster].src : undefined;

function LayerView({
  layer,
  visible,
  onReady,
  onEnded,
  onVideoEl,
}: {
  layer: Layer;
  visible: boolean;
  onReady: () => void;
  onEnded: () => void;
  onVideoEl: (el: HTMLVideoElement | null) => void;
}) {
  const style: React.CSSProperties = {
    opacity: visible ? 1 : 0,
    transition: `opacity ${FADE_MS}ms ease`,
  };
  if (layer.step.img) {
    const imageName = layer.step.img || layer.step.poster;
    const meta = imageName ? META[imageName] : undefined;
    const imageSrc = meta?.src;
    if (!imageSrc) return null;
    return (
      <img
        src={imageSrc}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        width={meta.w}
        height={meta.h}
        onLoad={onReady}
        className="mascot-layer mascot-layer--img"
        style={style}
      />
    );
  }
  return (
    <video
      ref={onVideoEl}
      src={videoSrc(layer.step) ?? undefined}
      poster={posterOf(layer.step)}
      autoPlay
      muted
      playsInline
      preload="metadata"
      onCanPlay={onReady}
      onEnded={onEnded}
      className="mascot-layer mascot-layer--video"
      style={style}
    />
  );
}

/**
 * Natural human blinking overlay.
 * Uses randomized intervals between 2.6s - 6.5s with occasional natural double-blinks.
 */
function MascotEyelids({
  scene,
  activeStep,
}: {
  scene: string;
  activeStep?: MascotVisualStep;
}) {
  const [isBlinking, setIsBlinking] = useState(false);
  const blinkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Retrieve eye coordinates from sprites metadata based on active sprite or scene name
  const eyes = useMemo(() => {
    // 1. If step explicitly specifies an img sprite
    if (activeStep?.img && META[activeStep.img]?.eyes) {
      return META[activeStep.img].eyes;
    }
    // 2. If step has a poster with eye meta
    if (activeStep?.poster && META[activeStep.poster]?.eyes) {
      return META[activeStep.poster].eyes;
    }
    // 3. Fallback to scene-specific eyes or idle eyes
    if (META[scene]?.eyes !== undefined) {
      return META[scene].eyes; // may be null for sunglasses e.g. confident
    }
    return META.idle?.eyes ?? null;
  }, [scene, activeStep]);

  useEffect(() => {
    // If character wears sunglasses or eyes are closed/null, don't blink
    if (!eyes || eyes.length === 0) {
      setIsBlinking(false);
      return;
    }

    let isMounted = true;

    const scheduleNextBlink = (delay?: number) => {
      // Natural human blinking distribution:
      // Normal pause between 2800ms and 6200ms
      // Occasionally (~18% chance) a natural double-blink (220ms pause)
      const nextDelay =
        delay !== undefined
          ? delay
          : Math.random() < 0.18
          ? Math.floor(220 + Math.random() * 140)
          : Math.floor(2600 + Math.random() * 3400);

      blinkTimerRef.current = setTimeout(() => {
        if (!isMounted) return;

        // Perform the blink: duration ~120-140ms
        const blinkDuration = Math.floor(115 + Math.random() * 25);
        setIsBlinking(true);

        setTimeout(() => {
          if (!isMounted) return;
          setIsBlinking(false);

          // If this was a primary blink, 16% chance to fire a rapid second blink
          if (Math.random() < 0.16) {
            scheduleNextBlink(Math.floor(180 + Math.random() * 120));
          } else {
            scheduleNextBlink();
          }
        }, blinkDuration);
      }, nextDelay);
    };

    // Initial random offset so avatars don't all blink at identical timestamps
    const initialDelay = Math.floor(1200 + Math.random() * 2400);
    scheduleNextBlink(initialDelay);

    return () => {
      isMounted = false;
      if (blinkTimerRef.current) clearTimeout(blinkTimerRef.current);
    };
  }, [eyes]);

  if (!eyes || eyes.length === 0) return null;

  return (
    <div
      className={`mascot-eyelids-container ${isBlinking ? 'mascot-eyelids--blinking' : ''}`}
      aria-hidden="true"
    >
      {eyes.map((eye, idx) => {
        // Expand the eyelid slightly beyond pupil radius to cleanly cover the eye aperture
        const widthPct = Math.max(3.2, eye.r * 200 * 1.55);
        const heightPct = Math.max(3.0, eye.r * 200 * 1.45);
        const leftPct = (eye.cx * 100);
        const topPct = (eye.cy * 100);

        return (
          <div
            key={idx}
            className="mascot-eyelid"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${widthPct}%`,
              height: `${heightPct}%`,
            }}
          >
            {/* The animated lid flap with subtle crease / skin shading */}
            <div className="mascot-eyelid-flap" />
          </div>
        );
      })}
    </div>
  );
}

export function MascotFigure({
  corner = false,
  lookAtOptions,
}: {
  corner?: boolean;
  lookAtOptions?: Parameters<typeof useMascotLookAt>[3];
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);

  const [scene, setScene] = useState('idle');
  const [front, setFront] = useState<Layer>({ key: 0, step: { v: 'idle', loop: true } });
  const [back, setBack] = useState<Layer | null>(null);
  const [backIn, setBackIn] = useState(false);

  const frontRef = useRef(front);
  frontRef.current = front;
  const backRef = useRef(back);
  backRef.current = back;
  const keyRef = useRef(0);
  const sceneRef = useRef('idle');
  const pendingRef = useRef<string | null>(null); // deferred switch (one-shot still playing)
  const stepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyKeys = useRef(new Set<number>());
  const videoEls = useRef(new Map<number, HTMLVideoElement>());

  const attachVideo = useCallback(
    (key: number) => (el: HTMLVideoElement | null) => {
      if (el) {
        videoEls.current.set(key, el);
        // corner figure is hidden while the chat panel is open → keep it quiet
        if (corner && document.body.classList.contains('chat-open')) el.pause();
      } else {
        videoEls.current.delete(key);
      }
    },
    [corner]
  );

  // ------------------------------------------------ scene → visual layers
  const startScene = useCallback((name: string) => {
    const visual = VIDEO_SCENES[name] ?? VIDEO_SCENES.idle;
    sceneRef.current = name;
    if (stepTimer.current) clearTimeout(stepTimer.current);

    // first step in
    const first = visual.steps[0];
    keyRef.current += 1;
    const layer: Layer = { key: keyRef.current, step: first };
    setBack(layer);
    setBackIn(false);
    pendingRef.current = null;

    // choreography: advance through timed steps (celebrate / oops / listen…)
    const advance = (idx: number) => {
      const step = visual.steps[idx];
      if (!step?.ms) return;
      const next = visual.loop ? (idx + 1) % visual.steps.length : idx + 1;
      if (next >= visual.steps.length) return;
      stepTimer.current = setTimeout(() => {
        if (sceneRef.current !== name) return; // a newer scene took over
        keyRef.current += 1;
        setBack({ key: keyRef.current, step: visual.steps[next] });
        setBackIn(false);
        advance(next);
      }, step.ms);
    };
    advance(0);
  }, []);

  useEffect(() => {
    const onScene = (name: string) => {
      setScene(name);
      // one-shot courtesy: while a one-shot VIDEO is still playing (wave… or
      // the tail of a choreography), a plain return to idle waits for its
      // natural end (onEnded) instead of cutting the gesture; any other scene
      // interrupts immediately.
      const busyOneShot = [frontRef.current, backRef.current].some(
        (l) => l && l.step.v && !l.step.loop
      );
      if (name === 'idle' && sceneRef.current !== 'idle' && busyOneShot) {
        pendingRef.current = 'idle';
        return;
      }
      startScene(name);
    };
    const unsub = mascot.subscribe(onScene);
    return () => {
      unsub();
      if (stepTimer.current) clearTimeout(stepTimer.current);
      if (fadeTimer.current) clearTimeout(fadeTimer.current);
    };
  }, [startScene]);

  // when the incoming layer's first frame is decodable → start it at 0 and fade in
  const handleReady = useCallback((key: number) => {
    if (readyKeys.current.has(key)) return;
    readyKeys.current.add(key);
    const el = videoEls.current.get(key);
    if (el) {
      try {
        if (el.currentTime > 0.05) el.currentTime = 0; // never resume mid-clip
      } catch {
        /* not seekable yet */
      }
      safePlay(el); // iOS Safari: muted+playsInline autoplay
    }
    setBackIn(true);
    // hand the DOM node over: back becomes front (same key → no remount,
    // no restart), the old front unmounts and releases its decoder.
    // Guard: if a newer layer superseded this one mid-fade, leave it alone.
    if (fadeTimer.current) clearTimeout(fadeTimer.current);
    fadeTimer.current = setTimeout(() => {
      const b = backRef.current;
      if (!b || b.key !== key) return;
      const oldKey = frontRef.current.key;
      setFront(b);
      setBack(null);
      setBackIn(false);
      if (oldKey !== key) readyKeys.current.delete(oldKey);
    }, FADE_MS + 60);
  }, []);

  // looping step finished → seamless self-crossfade; one-shot → hold last frame
  const handleEnded = useCallback(
    (key: number) => {
      if (key !== frontRef.current.key) return;
      const step = frontRef.current.step;
      if (step.loop) {
        keyRef.current += 1;
        setBack({ key: keyRef.current, step });
        setBackIn(false);
      }
      if (pendingRef.current) {
        const p = pendingRef.current;
        pendingRef.current = null;
        startScene(p);
      }
    },
    [startScene]
  );

  // tab hidden → resume the front video when the user comes back
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      const f = frontRef.current;
      const el = videoEls.current.get(f.key);
      if (el && !el.ended && el.paused) safePlay(el);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // corner figure: the chat panel "owns" the mascot while open → pause corner video
  useEffect(() => {
    if (!corner) return;
    const apply = () => {
      const hidden = document.body.classList.contains('chat-open');
      videoEls.current.forEach((el) => {
        if (hidden) {
          el.pause();
        } else if (!el.ended && el.paused && el.currentTime < Math.max(0, (el.duration || 1) - 0.3)) {
          safePlay(el);
        }
      });
    };
    const mo = new MutationObserver(apply);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    apply();
    return () => mo.disconnect();
  }, [corner]);

  // ------------------------------------------------ head & eye gaze tracking
  // Smooth transition (lerp) allows the gaze/eyes to follow the cursor with a natural slight delay
  useMascotLookAt(rootRef, bodyRef, screenRef, lookAtOptions);

  return (
    <div
      ref={rootRef}
      className={`mascot-figure ${corner ? 'mascot-figure--corner' : ''}`}
      data-scene={scene}
      data-anim="1"
    >
      <div className="mascot-body" ref={bodyRef}>
        <div className="mascot-screen" ref={screenRef}>
          {/* keys are stable across the front↔back hand-over: React moves the
              same <video> DOM node (keeps playing) instead of remounting it */}
          <LayerView
            key={front.key}
            layer={front}
            visible
            onReady={() => undefined}
            onEnded={() => handleEnded(front.key)}
            onVideoEl={attachVideo(front.key)}
          />
          {back && (
            <LayerView
              key={back.key}
              layer={back}
              visible={backIn}
              onReady={() => handleReady(back.key)}
              onEnded={() => handleEnded(back.key)}
              onVideoEl={attachVideo(back.key)}
            />
          )}

          <MascotEyelids scene={scene} activeStep={backIn && back ? back.step : front.step} />
        </div>
      </div>
    </div>
  );
}

/**
 * Corner widget — a 3D rounded-rect card, RTL: the avatar comes first (right)
 * and everything the mascot says lives in its own dedicated text box right
 * beside it — INSIDE the frame, never floating above its head. With no
 * message the card is just the framed avatar (chat launcher); when a message
 * arrives the card springs open to reveal the text box.
 */
export function MascotAvatar() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const compactTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [bubble, setBubble] = useState<{ id: number; text: string; shown: string; askName?: boolean } | null>(null);
  const bubbleId = useRef(0);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typeInt = useRef<ReturnType<typeof setInterval> | null>(null);
  const [nameInput, setNameInput] = useState('');

  const showBubble = useCallback((text: string, ms: number, askName = false) => {
    bubbleId.current += 1;
    setBubble({ id: bubbleId.current, text, shown: '', askName });
    let i = 0;
    if (typeInt.current) clearInterval(typeInt.current);
    typeInt.current = setInterval(() => {
      i += 1;
      setBubble((b) => (b ? { ...b, shown: text.slice(0, i) } : b));
      if (i >= text.length && typeInt.current) {
        clearInterval(typeInt.current);
        typeInt.current = null;
      }
    }, 20);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), ms);
  }, []);

  useEffect(() => {
    const onCue = (e: Event) => {
      const d = (e as CustomEvent<MascotCue>).detail;
      if (!d?.text) return;
      showBubble(d.text, d.ms ?? 4200, d.askName);
    };
    window.addEventListener('mascot:cues', onCue);
    return () => {
      window.removeEventListener('mascot:cues', onCue);
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
      if (typeInt.current) clearInterval(typeInt.current);
    };
  }, [showBubble]);

  // while scrolling: compact + dim so sections stay readable
  useEffect(() => {
    let last = 0;
    const onScroll = () => {
      const root = rootRef.current;
      if (!root) return;
      const now = Date.now();
      if (now - last > 90) root.classList.add('mascot-compact');
      last = now;
      if (compactTimer.current) clearTimeout(compactTimer.current);
      compactTimer.current = setTimeout(() => root.classList.remove('mascot-compact'), 550);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (compactTimer.current) clearTimeout(compactTimer.current);
    };
  }, []);

  // ---- name capture ------------------------------------------------------
  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    const n = nameInput.trim().slice(0, 24);
    if (!n) return;
    try {
      localStorage.setItem('nd-mascot-name', n);
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new CustomEvent('nd:mascot-name', { detail: n }));
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    soulJourney({ pose: 'excited', hold: 2.4, then: 'happy' });
    showBubble(`خوشحالم شناختم، ${n}! هر سوالی بود در خدمتم.`, 4600);
  };

  const skipName = () => {
    try {
      localStorage.setItem('nd-mascot-skip', '1');
    } catch {
      /* private mode */
    }
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    setBubble(null);
    soulJourney({ pose: 'wave', hold: 2.6 });
  };

  // the input row appears right away so the visitor can start typing
  const askVisible = !!bubble?.askName;

  return (
    <div ref={rootRef} className="mascot-root fixed bottom-2 start-2 z-[50] sm:bottom-4 sm:start-5">
      <div
        className="mascot-card"
        onClick={() => window.dispatchEvent(new CustomEvent('nd:open-chat'))}
        role="button"
        tabIndex={0}
        aria-label="دستیار هوشمند — باز کردن گفتگو"
        onKeyDown={(e) => {
          // only react to keys pressed ON the card itself — the name input
          // inside must keep Enter/Space for typing + form submit
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('nd:open-chat'));
          }
        }}
      >
        {/* avatar first (right in RTL) */}
        <div className="mascot-card-avatar">
          <div className="mascot-sway">
            <MascotFigure corner />
          </div>
        </div>

        {/* the mascot's words — its own box, inside the frame */}
        <AnimatePresence initial={false}>
          {bubble && (
            <motion.div
              key={bubble.id}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="mascot-card-text"
              onMouseEnter={() => {
                if (bubbleTimer.current && bubble?.askName) clearTimeout(bubbleTimer.current);
              }}
            >
              <div className="mascot-card-text-inner">
                <span className="mascot-card-said">{bubble.shown}</span>
                {askVisible && (
                  <form
                    onSubmit={submitName}
                    className="mascot-ask-row"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      autoFocus
                      maxLength={24}
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      onFocus={() => {
                        // user is answering — stop the box from dismissing
                        if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
                      }}
                      placeholder="اسمت چیه؟"
                      className="mascot-ask-input"
                      aria-label="اسم شما"
                    />
                    <button type="submit" className="mascot-ask-btn mascot-ask-btn--ok">
                      ثبت
                    </button>
                    <button type="button" onClick={skipName} className="mascot-ask-btn">
                      بعداً
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';

/**
 * useKeyboardOpen — true while a mobile soft keyboard is likely covering the
 * bottom of the viewport (a text field / contenteditable has focus).
 *
 * Fixed bottom chrome (QuickActionDock, mascot card) hides itself while this is
 * true: on iOS the keyboard overlays the visual viewport instead of resizing
 * the layout viewport, which otherwise leaves half-buried, jumped UI stuck
 * above the keys. Combined with `interactive-widget=resizes-content` in the
 * viewport meta (Android Chrome resizes the layout viewport instead).
 *
 * `keepOpenSelector` — a CSS selector for widgets that OWN a text field (e.g.
 * '.mascot-root'): while focus is inside such a widget the hook reports false
 * so the widget never hides itself mid-typing.
 */
export function useKeyboardOpen(keepOpenSelector?: string): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const isTextEntry = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') return false;
      const type = (el as HTMLInputElement).type;
      // buttons/radios/checkboxes don't summon the keyboard
      return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(type);
    };
    const focusInsideKeepOpen = (el: EventTarget | null): boolean =>
      keepOpenSelector != null && el instanceof HTMLElement && Boolean(el.closest(keepOpenSelector));
    const onFocusIn = (e: FocusEvent) => {
      if (isTextEntry(e.target) && !focusInsideKeepOpen(e.target)) setOpen(true);
    };
    const onFocusOut = () => {
      // defer: moving focus between fields fires out→in synchronously
      setTimeout(() => {
        const active = document.activeElement;
        if (!isTextEntry(active) || focusInsideKeepOpen(active)) setOpen(false);
      }, 50);
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, [keepOpenSelector]);

  return open;
}

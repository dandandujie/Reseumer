import { useEffect } from 'react';

/**
 * Sets [data-design=...] on <html> while this component is mounted.
 * Portal-rendered surfaces (Radix Dialog, Dropdown, Tooltip) inherit from
 * <html>, so this is the only way to scope a design system to them without
 * editing every Portal call site.
 */
export function useDesignAttribute(value: string) {
  useEffect(() => {
    const prev = document.documentElement.getAttribute('data-design');
    document.documentElement.setAttribute('data-design', value);
    return () => {
      if (prev === null) {
        document.documentElement.removeAttribute('data-design');
      } else {
        document.documentElement.setAttribute('data-design', prev);
      }
    };
  }, [value]);
}

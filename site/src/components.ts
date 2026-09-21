export function copyCode(root: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  return {
    status: '',
    pending: false,
    async copy() {
      if (this.pending || destroyed) return;
      clearTimeout(timer);
      this.status = '';
      this.pending = true;
      try {
        const code = root.querySelector('pre code')?.textContent;
        if (!navigator.clipboard?.writeText || !code) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(code);
        if (destroyed) return;
        this.status = 'Copied to clipboard.';
        timer = setTimeout(() => { this.status = ''; }, 3000);
      } catch {
        if (!destroyed) this.status = 'Could not copy. Select the code to copy it.';
      } finally {
        if (!destroyed) this.pending = false;
      }
    },
    destroy() { destroyed = true; clearTimeout(timer); },
  };
}

export function docsNavigation(root: HTMLElement) {
  let cleanup = () => {};
  let frame: number | undefined;
  return {
    query: '',
    active: 'getting-started',
    init() {
      const sections = [...root.querySelectorAll<HTMLElement>('article section[id]')];
      const menu = root.querySelector<HTMLDetailsElement>('.docs-sidebar details');
      const desktop = matchMedia('(min-width: 1024px)');
      let lastFocused = document.activeElement;
      const trackFocus = () => { lastFocused = document.activeElement; };
      root.addEventListener('focusin', trackFocus);
      const syncMenu = () => {
        if (!menu) return;
        // A breakpoint can hide the focused control before matchMedia dispatches its change event.
        const focused = document.activeElement === document.body ? lastFocused : document.activeElement;
        if (!desktop.matches && menu.contains(focused)) menu.querySelector('summary')?.focus();
        if (desktop.matches && focused === menu.querySelector('summary')) {
          sections.find(section => section.id === this.active)?.focus({ preventScroll: true });
        }
        menu.open = desktop.matches;
      };
      const syncHash = () => {
        const section = sections.find(item => `#${item.id}` === location.hash);
        if (section) this.active = section.id;
      };
      const observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) this.active = entry.target.id;
      }, { rootMargin: '-5% 0px -65% 0px', threshold: 0 });
      sections.forEach(section => observer.observe(section));
      syncMenu();
      syncHash();
      desktop.addEventListener('change', syncMenu);
      window.addEventListener('hashchange', syncHash);
      cleanup = () => {
        observer.disconnect();
        if (frame !== undefined) cancelAnimationFrame(frame);
        root.removeEventListener('focusin', trackFocus);
        desktop.removeEventListener('change', syncMenu);
        window.removeEventListener('hashchange', syncHash);
      };
    },
    matches(label: string) { return label.toLowerCase().includes(this.query.toLowerCase().trim()); },
    get hasResults() {
      return [...root.querySelectorAll<HTMLAnchorElement>('.docs-nav a')].some(link => this.matches(link.textContent ?? ''));
    },
    navigate(event: MouseEvent) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.currentTarget as HTMLAnchorElement;
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      this.active = target.id;
      const menu = root.querySelector<HTMLDetailsElement>('.docs-sidebar details');
      if (menu && !matchMedia('(min-width: 1024px)').matches) menu.open = false;
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = undefined;
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
      });
    },
    destroy() { cleanup(); },
  };
}

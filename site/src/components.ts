export function copyCode(root: HTMLElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;
  return {
    status: '',
    pending: false,
    async copy() {
      if (this.pending || destroyed) return;
      clearTimeout(timer);
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
  return {
    query: '',
    active: 'getting-started',
    init() {
      const sections = [...root.querySelectorAll<HTMLElement>('article section[id]')];
      const menu = root.querySelector<HTMLDetailsElement>('.docs-sidebar details');
      const desktop = matchMedia('(min-width: 1024px)');
      const syncMenu = () => { if (menu) menu.open = desktop.matches; };
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
      requestAnimationFrame(() => {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ block: 'start' });
      });
    },
    destroy() { cleanup(); },
  };
}

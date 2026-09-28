// Share button for the product page.
//
// Opens the device's own share sheet through the Web Share API, so the customer
// gets WhatsApp, Instagram, Messages and everything else they actually have
// installed, rather than a fixed list of networks we guessed at. WhatsApp matters
// most here: it is how this shop's customers send things to each other.
//
// The API is not everywhere -- notably desktop Firefox, and any browser served
// over plain HTTP -- so the fallback copies the link to the clipboard and says so.
// A share button that silently does nothing is worse than no share button.
//
// Deliberately a plain custom element with no imports: it must keep working even
// if the theme's module graph changes underneath it.
class ShareButton extends HTMLElement {
  connectedCallback() {
    this.button = this.querySelector('[data-share-trigger]');
    this.feedback = this.querySelector('[data-share-feedback]');
    if (!this.button) return;
    this.button.addEventListener('click', this.onClick);
  }

  disconnectedCallback() {
    this.button?.removeEventListener('click', this.onClick);
    clearTimeout(this.timer);
  }

  onClick = async () => {
    const url = this.dataset.url;
    if (!url) return;
    const title = this.dataset.title || document.title;

    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch (error) {
        // The customer opened the sheet and dismissed it. That is not a failure,
        // and falling through to "Link copied" here would be baffling.
        if (error?.name === 'AbortError') return;
        // Anything else (permission denied, unsupported payload) falls through
        // to the copy fallback below.
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      this.say(this.dataset.copiedLabel || 'Link copied');
    } catch {
      // Clipboard access can be refused outright; hand the link over so the
      // customer can still copy it themselves.
      window.prompt(this.dataset.copyPromptLabel || 'Copy this link', url);
    }
  };

  say(message) {
    if (!this.feedback) return;
    this.feedback.textContent = message;
    this.feedback.classList.add('share-button__feedback--visible');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.feedback.classList.remove('share-button__feedback--visible');
    }, 2500);
  }
}

if (!customElements.get('share-button')) {
  customElements.define('share-button', ShareButton);
}

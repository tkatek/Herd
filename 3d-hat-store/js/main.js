
/**
 * ============================================================
 * KRVN — main.js
 * Scroll animations, Video Scrubbing, Cart logic, Marquee
 * ============================================================
 *
 * DEPENDENCIES (loaded via CDN in index.html):
 *   - GSAP 3.12+ core
 *   - ScrollTrigger plugin (registered below)
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// 1. GSAP PLUGIN REGISTRATION
// ─────────────────────────────────────────────────────────────
gsap.registerPlugin(ScrollTrigger);


// ─────────────────────────────────────────────────────────────
// 2. UTILITY — Wait for DOM ready
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Cache DOM elements we'll use throughout
  const header      = document.getElementById('site-header');
  const navToggle   = document.getElementById('nav-toggle');
  const mobileNav   = document.getElementById('mobile-nav');
  const cartCount   = document.getElementById('cart-count');
  const toast       = document.getElementById('toast');
  const heroVideo   = document.getElementById('hero-video');
  const productGrid = document.getElementById('product-grid');

  // ───────────────────────────────────────────────────────────
  // 3. HEADER — Scroll-triggered style toggle
  //    Adds a blurred/dark background once user scrolls past
  //    the viewport fold (100px threshold).
  // ───────────────────────────────────────────────────────────
  ScrollTrigger.create({
    start: 'top -80px',        // Trigger 80px below the very top
    onEnter:     () => header.classList.add('scrolled'),
    onLeaveBack: () => header.classList.remove('scrolled'),
  });


  // ───────────────────────────────────────────────────────────
  // 4. MOBILE NAV TOGGLE
  // ───────────────────────────────────────────────────────────
  navToggle.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    navToggle.classList.toggle('open', isOpen);
    // Prevent body scroll when nav is open
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close mobile nav when a link is clicked
  document.querySelectorAll('.mob-link').forEach(link => {
    link.addEventListener('click', () => {
      mobileNav.classList.remove('open');
      navToggle.classList.remove('open');
      document.body.style.overflow = '';
    });
  });


  // ───────────────────────────────────────────────────────────
  // 5. SCROLL-SCRUBBING VIDEO — The Core Feature
  //
  //  HOW IT WORKS (read carefully to tune timing):
  //
  //  The hero section is 200vh tall. The video wrapper inside
  //  it is `position: sticky; height: 100vh` — this means:
  //    • The video sticks to the top of the viewport
  //    • The user scrolls through 100vh of "extra" scroll distance
  //      while the video remains visually pinned
  //
  //  We create a ScrollTrigger that watches this 100vh of extra
  //  scroll travel (the section height minus the viewport height).
  //  As the user scrolls, `progress` goes from 0 → 1.
  //
  //  We then multiply `progress × video.duration` to get
  //  the target `currentTime` in seconds, and set it directly.
  //  This means:
  //    • progress = 0   → video at frame 0 (start)
  //    • progress = 0.5 → video at exact midpoint
  //    • progress = 1   → video at last frame (end)
  //
  //  TUNING TIPS:
  //
  //  a) If the video feels too fast (plays through before you
  //     reach the bottom of the hero), INCREASE the hero section
  //     height in CSS (e.g., height: 350vh) — this gives more
  //     scroll travel per video second.
  //
  //  b) If the video plays too slowly (hero is very long),
  //     DECREASE the hero height (e.g., height: 150vh).
  //
  //  c) To play only a PORTION of the video (e.g., first 5s of
  //     a 10s clip), multiply progress by your desired end time:
  //     heroVideo.currentTime = progress * 5;   // Only plays 0–5s
  //
  //  d) For smoother playback on lower-end devices, consider
  //     adding a requestAnimationFrame-based lerp (linear
  //     interpolation) so the currentTime eases toward its
  //     target rather than jumping instantly. See LERP note below.
  //
  //  e) Video MUST be: muted, preload="auto", and ideally
  //     an H.264 .mp4 (broad browser support). Keep it under
  //     10MB for best performance. A 6-8 second loop at ~1080p
  //     is ideal. The video does NOT autoplay — scrubbing drives it.
  // ───────────────────────────────────────────────────────────

  if (heroVideo) {

    /**
     * We wait for `loadedmetadata` so that `video.duration`
     * is available before we try to do math with it.
     * Without this, duration returns NaN and scrubbing breaks.
     */
    heroVideo.addEventListener('loadedmetadata', initVideoScrub);

    /**
     * Fallback: if the video hasn't loaded metadata yet
     * but loadedmetadata already fired (e.g., cached), run now.
     */
    if (heroVideo.readyState >= 1) {
      initVideoScrub();
    }

    function initVideoScrub() {
      heroVideo.pause();
      heroVideo.currentTime = 0;
      /**
       * `video.duration` — total length of the video in seconds.
       * Example: a 6-second clip gives duration = 6.
       *
       * ScrollTrigger `onUpdate` fires on every scroll tick
       * with a `self` object containing `self.progress` (0 to 1).
       *
       * We map progress → currentTime linearly:
       *   targetTime = progress × duration
       *
       * The `clamp` ensures we never go below 0 or beyond the
       * video's last valid frame (prevents seek errors).
       */
      const videoDuration = heroVideo.duration;

      ScrollTrigger.create({
        trigger:    '.hero-section',      // The pinning parent element
        start:      'top top',            // When hero top hits viewport top
        end:        'bottom bottom',      // When hero bottom hits viewport bottom
        scrub:      true,                 // Ties animation to scroll position (true = instant, number = lag seconds)
        once:       false,
        onEnter:    () => heroVideo.pause(),
        onEnterBack: () => heroVideo.pause(),
        onLeave:    () => heroVideo.pause(),
        onLeaveBack: () => heroVideo.pause(),
        /*
         * scrub: true  → currentTime updates instantly with scroll.
         *                 Most precise, but can feel mechanical.
         * scrub: 0.5   → currentTime lags 0.5s behind scroll.
         *                 Feels smoother but less accurate.
         * scrub: 1     → 1s lag. Very smooth, good for cinematic
         *                 feels. Recommended for final production.
         *
         * START WITH: scrub: true  (easiest to debug)
         * TUNE TO:    scrub: 0.8   (once timing feels right)
         */

        onUpdate: (self) => {
          /**
           * self.progress: 0 at hero start, 1 at hero end.
           *
           * MATH BREAKDOWN:
           *   targetTime = self.progress × videoDuration
           *
           * Example with a 6-second video:
           *   scroll 0%  → progress=0.00 → currentTime = 0.00s (frame 1)
           *   scroll 25% → progress=0.25 → currentTime = 1.50s
           *   scroll 50% → progress=0.50 → currentTime = 3.00s
           *   scroll 75% → progress=0.75 → currentTime = 4.50s
           *   scroll 100%→ progress=1.00 → currentTime = 6.00s (last)
           *
           * gsap.utils.clamp(min, max, value) prevents out-of-range seeks.
           */
          const targetTime = gsap.utils.clamp(
            0,
            videoDuration,
            self.progress * videoDuration
          );

          /*
           * DIRECT ASSIGNMENT (default):
           * Instantly sets the video frame. Best for precision.
           */
          heroVideo.currentTime = targetTime;

          /*
           * ── LERP ALTERNATIVE ─────────────────────────────────
           * For extra-smooth playback, replace the line above with
           * a lerp inside requestAnimationFrame. Uncomment below:
           *
           * window._videoTargetTime = targetTime;
           *
           * Then add this outside this ScrollTrigger, once:
           * (function lerpLoop() {
           *   requestAnimationFrame(lerpLoop);
           *   const current = heroVideo.currentTime;
           *   const target  = window._videoTargetTime || 0;
           *   const speed   = 0.08; // 0 = no movement, 1 = instant
           *   heroVideo.currentTime = current + (target - current) * speed;
           * })();
           * ─────────────────────────────────────────────────────
           */
        },
      });

      console.log(
        `[KRVN] Video scrub initialized. Duration: ${videoDuration.toFixed(2)}s. ` +
        `Map: scroll 0→100% plays 0→${videoDuration.toFixed(2)}s.`
      );
    }

  } else {
    console.warn('[KRVN] #hero-video not found. Scroll scrub skipped.');
  }


  // ───────────────────────────────────────────────────────────
  // 6. HERO ENTRANCE ANIMATION
  //    Staggered reveal of hero text elements on page load.
  //    Runs once on load (not scroll-triggered).
  // ───────────────────────────────────────────────────────────
  const heroTl = gsap.timeline({ delay: 0.3 });

  heroTl
    .from('.hero-eyebrow .tag', {
      y: 20,
      opacity: 0,
      duration: 0.7,
      stagger: 0.12,
      ease: 'power3.out',
    })
    .from('.hero-title .line-1', {
      y: 80,
      opacity: 0,
      duration: 0.9,
      ease: 'power4.out',
    }, '-=0.4')
    .from('.hero-title .line-2', {
      y: 80,
      opacity: 0,
      duration: 0.9,
      ease: 'power4.out',
    }, '-=0.65')
    .from('.hero-sub', {
      y: 20,
      opacity: 0,
      duration: 0.7,
      ease: 'power3.out',
    }, '-=0.4')
    .from('.hero-ctas .btn', {
      y: 20,
      opacity: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power3.out',
    }, '-=0.4')
    .from('.scroll-indicator', {
      opacity: 0,
      duration: 1,
      ease: 'power2.out',
    }, '-=0.2');


  // ───────────────────────────────────────────────────────────
  // 7. SECTION SCROLL ANIMATIONS
  //    Each section reveals on scroll using ScrollTrigger.
  //    matchMedia ensures reduced motion is respected.
  // ───────────────────────────────────────────────────────────
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!prefersReducedMotion) {

    // ── Zigzag rows: alternating left/right slides ──────────
    document.querySelectorAll('.zigzag-row--normal').forEach(row => {
      gsap.from(row.querySelector('.zigzag-media'), {
        scrollTrigger: {
          trigger:  row,
          start:    'top 80%',
          toggleActions: 'play none none none',
        },
        x:       -60,
        opacity: 0,
        duration: 0.9,
        ease:    'power3.out',
      });
      gsap.from(row.querySelector('.zigzag-text'), {
        scrollTrigger: {
          trigger:  row,
          start:    'top 80%',
          toggleActions: 'play none none none',
        },
        x:       60,
        opacity: 0,
        duration: 0.9,
        ease:    'power3.out',
        delay:   0.1,
      });
    });

    document.querySelectorAll('.zigzag-row--reverse').forEach(row => {
      gsap.from(row.querySelector('.zigzag-media'), {
        scrollTrigger: {
          trigger:  row,
          start:    'top 80%',
          toggleActions: 'play none none none',
        },
        x:       60,
        opacity: 0,
        duration: 0.9,
        ease:    'power3.out',
      });
      gsap.from(row.querySelector('.zigzag-text'), {
        scrollTrigger: {
          trigger:  row,
          start:    'top 80%',
          toggleActions: 'play none none none',
        },
        x:      -60,
        opacity: 0,
        duration: 0.9,
        ease:    'power3.out',
        delay:   0.1,
      });
    });

    // ── Product cards: staggered fade-up ────────────────────
    gsap.from('.product-card', {
      scrollTrigger: {
        trigger:  '.product-grid',
        start:    'top 85%',
        toggleActions: 'play none none none',
      },
      y:       50,
      opacity: 0,
      duration: 0.7,
      stagger:  0.1,
      ease:    'power3.out',
    });

    // ── Filter bar slide in ──────────────────────────────────
    gsap.from('.filter-btn', {
      scrollTrigger: {
        trigger:  '.filter-bar',
        start:    'top 90%',
        toggleActions: 'play none none none',
      },
      y:       20,
      opacity: 0,
      duration: 0.5,
      stagger:  0.06,
      ease:    'power2.out',
    });

    // ── Banner: text + media ─────────────────────────────────
    gsap.from('.banner-text', {
      scrollTrigger: {
        trigger:  '.banner-section',
        start:    'top 75%',
        toggleActions: 'play none none none',
      },
      x:       -50,
      opacity: 0,
      duration: 0.9,
      ease:    'power3.out',
    });
    gsap.from('.banner-media', {
      scrollTrigger: {
        trigger:  '.banner-section',
        start:    'top 75%',
        toggleActions: 'play none none none',
      },
      x:       50,
      opacity: 0,
      duration: 0.9,
      ease:    'power3.out',
      delay:   0.15,
    });

    // ── Blog cards: staggered ────────────────────────────────
    gsap.from('.blog-card', {
      scrollTrigger: {
        trigger:  '.blog-grid',
        start:    'top 85%',
        toggleActions: 'play none none none',
      },
      y:       40,
      opacity: 0,
      duration: 0.7,
      stagger:  0.12,
      ease:    'power3.out',
    });

    // ── Contact section ──────────────────────────────────────
    gsap.from('.contact-media', {
      scrollTrigger: {
        trigger:  '.contact-section',
        start:    'top 80%',
        toggleActions: 'play none none none',
      },
      y:       40,
      opacity: 0,
      duration: 0.8,
      ease:    'power3.out',
    });
    gsap.from('.contact-text > *', {
      scrollTrigger: {
        trigger:  '.contact-section',
        start:    'top 80%',
        toggleActions: 'play none none none',
      },
      y:       30,
      opacity: 0,
      duration: 0.7,
      stagger:  0.1,
      ease:    'power3.out',
      delay:   0.1,
    });

    // ── Section titles: parallax lift ───────────────────────
    document.querySelectorAll('.section-title').forEach(title => {
      gsap.from(title, {
        scrollTrigger: {
          trigger:  title,
          start:    'top 85%',
          toggleActions: 'play none none none',
        },
        y:       40,
        opacity: 0,
        duration: 0.8,
        ease:    'power3.out',
      });
    });

  } // end if !prefersReducedMotion


  // ───────────────────────────────────────────────────────────
  // 8. MARQUEE — Infinite horizontal scroll animation
  //
  //    We duplicate the track content via JS to ensure a seamless
  //    loop regardless of viewport width. GSAP animates `x` from
  //    0 to -50% (one full set of content), then loops.
  // ───────────────────────────────────────────────────────────
  const marqueeTrack = document.querySelector('.marquee-track');

  if (marqueeTrack) {
    // Clone the content once more for seamless looping
    const clone = marqueeTrack.cloneNode(true);
    marqueeTrack.parentElement.appendChild(clone);

    // Animate both tracks together
    gsap.to([marqueeTrack, clone], {
      x:       '-50%',    // Move left by 50% of the doubled content width
      duration: 30,       // Adjust: lower = faster marquee, higher = slower
      ease:    'none',    // Linear — no acceleration
      repeat:  -1,        // Infinite loop
      modifiers: {
        // modifiers keep the animation seamless across clones
        x: gsap.utils.unitize(x => parseFloat(x) % (marqueeTrack.offsetWidth / 2))
      }
    });
  }


  // ───────────────────────────────────────────────────────────
  // 9. SCROLL INDICATOR — Hide when user scrolls past hero
  // ───────────────────────────────────────────────────────────
  const scrollIndicator = document.querySelector('.scroll-indicator');

  if (scrollIndicator) {
    ScrollTrigger.create({
      trigger:  '.hero-section',
      start:    'top top',
      end:      '40% top',     // Hide after scrolling 40% of hero
      onUpdate: (self) => {
        // Fade out as user scrolls deeper into hero
        scrollIndicator.style.opacity = 1 - self.progress * 2;
      }
    });
  }


  // ───────────────────────────────────────────────────────────
  // 10. PRODUCT FILTER — Category toggle
  //
  //    Filter buttons show/hide product cards based on their
  //    data-category attribute. Active state is toggled on btn.
  //    A small GSAP fade is applied to newly shown cards.
  // ───────────────────────────────────────────────────────────
  const filterBtns    = document.querySelectorAll('.filter-btn');
  const productCards  = document.querySelectorAll('.product-card');

  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Update active button
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;  // 'all', 'snapback', etc.

      productCards.forEach(card => {
        const match = filter === 'all' || card.dataset.category === filter;

        if (match) {
          card.classList.remove('hidden');
          // Animate newly revealed cards
          gsap.fromTo(card,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
          );
        } else {
          card.classList.add('hidden');
        }
      });
    });
  });


  // ───────────────────────────────────────────────────────────
  // 11. CART — Simple localStorage cart
  //
  //    "Add to Cart" stores items in localStorage as JSON.
  //    Cart count badge updates in real-time.
  //    Full cart UI will be built in cart.js / cart.html.
  //    This block only handles the "quick add" buttons here.
  // ───────────────────────────────────────────────────────────

  /**
   * Reads the cart from localStorage.
   * Returns an array of cart item objects.
   */
  function getCart() {
    try {
      return JSON.parse(localStorage.getItem('krvn_cart')) || [];
    } catch {
      return [];
    }
  }

  /**
   * Saves the cart array back to localStorage.
   * @param {Array} cart
   */
  function saveCart(cart) {
    localStorage.setItem('krvn_cart', JSON.stringify(cart));
  }

  /**
   * Updates the cart count badge in the header.
   * Counts total quantity across all items.
   */
  function updateCartBadge() {
    const cart = getCart();
    const total = cart.reduce((sum, item) => sum + (item.qty || 1), 0);
    if (cartCount) {
      cartCount.textContent = total;
      // Pulse animation on update
      gsap.fromTo(cartCount,
        { scale: 1.6 },
        { scale: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' }
      );
    }
  }

  /**
   * Shows a toast notification with a message.
   * Auto-dismisses after 2.5 seconds.
   * @param {string} message
   */
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  /**
   * Adds a product to the cart.
   * If the item already exists (same id), increments quantity.
   * @param {string} id
   * @param {string} name
   * @param {number} price
   */
  function addToCart(id, name, price) {
    const cart    = getCart();
    const existing = cart.find(item => item.id === id);

    if (existing) {
      existing.qty = (existing.qty || 1) + 1;
    } else {
      cart.push({ id, name, price: parseFloat(price), qty: 1 });
    }

    saveCart(cart);
    updateCartBadge();
    showToast(`✓ ${name} added to cart`);
  }

  // Wire up all "Quick Add" buttons in the product grid
  document.querySelectorAll('.quick-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();  // Don't bubble to product card
      const { id, name, price } = btn.dataset;
      addToCart(id, name, price);

      // Visual feedback on the button itself
      const original = btn.textContent;
      btn.textContent = '✓ Added';
      btn.style.background = 'var(--color-forest)';
      setTimeout(() => {
        btn.textContent = original;
        btn.style.background = '';
      }, 1200);
    });
  });

  // Initialize badge on load (in case cart has items from prev visit)
  updateCartBadge();


  // ───────────────────────────────────────────────────────────
  // 12. SMOOTH ANCHOR SCROLL
  //    Overrides default jump behaviour for all in-page links.
  //    Offsets for the fixed header height.
  // ───────────────────────────────────────────────────────────
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();

      const headerHeight = parseInt(
        getComputedStyle(document.documentElement).getPropertyValue('--header-h')
      ) || 72;

      const targetY = target.getBoundingClientRect().top + window.scrollY - headerHeight;

      gsap.to(window, {
        scrollTo: targetY,         // GSAP ScrollToPlugin alternative
        duration: 1.2,
        ease:    'power3.inOut',
      });

      // Fallback if ScrollToPlugin isn't loaded
      if (!gsap.plugins?.scrollTo) {
        window.scrollTo({ top: targetY, behavior: 'smooth' });
      }
    });
  });


  // ───────────────────────────────────────────────────────────
  // 13. PARALLAX — Subtle parallax on section headers
  //    Moves section headings at 60% of scroll speed, creating
  //    a depth effect as sections scroll into view.
  // ───────────────────────────────────────────────────────────
  if (!prefersReducedMotion) {
    document.querySelectorAll('.section-header').forEach(el => {
      gsap.to(el, {
        scrollTrigger: {
          trigger: el,
          start:   'top bottom',
          end:     'bottom top',
          scrub:   true,           // Ties to scroll position
        },
        y: -30,                    // Moves up 30px over the scroll range
        ease: 'none',              // Linear parallax (no easing)
      });
    });
  }


  // ───────────────────────────────────────────────────────────
  // 14. SCROLL PROGRESS BAR (optional enhancement)
  //    A thin progress bar at the very top of the page
  //    showing how far down the user has scrolled.
  // ───────────────────────────────────────────────────────────
  const progressBar = document.createElement('div');
  progressBar.id = 'scroll-progress';
  Object.assign(progressBar.style, {
    position:   'fixed',
    top:        '0',
    left:       '0',
    height:     '2px',
    background: 'var(--color-forest-light)',
    zIndex:     '9999',
    width:      '0%',
    transition: 'width 0.1s linear',
    pointerEvents: 'none',
  });
  document.body.prepend(progressBar);

  ScrollTrigger.create({
    start:    'top top',
    end:      'bottom bottom',
    onUpdate: (self) => {
      progressBar.style.width = `${self.progress * 100}%`;
    },
  });


  // ───────────────────────────────────────────────────────────
  // 15. RESIZE HANDLER
  //    Tells ScrollTrigger to recalculate all trigger positions
  //    after a window resize (handles orientation change too).
  // ───────────────────────────────────────────────────────────
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      ScrollTrigger.refresh();
      console.log('[KRVN] ScrollTrigger refreshed after resize.');
    }, 250);
  });


  // ───────────────────────────────────────────────────────────
  // INIT COMPLETE
  // ───────────────────────────────────────────────────────────
  console.log('[KRVN] main.js initialized. Video scrub + all animations ready.');

}); // end DOMContentLoaded
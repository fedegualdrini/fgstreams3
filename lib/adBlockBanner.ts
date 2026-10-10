/** sessionStorage key recording that the visitor dismissed the ad-block banner. */
export const ADBLOCK_BANNER_STORAGE_KEY = 'adblock-banner-dismissed';

/** Attribute set on <html> before first paint for visitors who already dismissed it. */
export const ADBLOCK_BANNER_DISMISSED_ATTRIBUTE = 'data-adblock-dismissed';

/**
 * Inline script for the top of <body> (see app/layout.tsx). The banner is always
 * part of the server HTML so it never pops in after hydration and pushes the page
 * down (a layout shift); this marks <html> early and CSS hides the banner for
 * returning visitors instead.
 */
export const ADBLOCK_BANNER_BOOT_SCRIPT =
  `try{if(sessionStorage.getItem('${ADBLOCK_BANNER_STORAGE_KEY}'))document.documentElement.setAttribute('${ADBLOCK_BANNER_DISMISSED_ATTRIBUTE}','')}catch(e){}`;

# Hosting `flow.js` for the police discipline explainer

**For:** whoever maintains signalcleveland.org's theme.
**From:** Emma Sedlak. Post 84759, "How Cleveland police discipline works."

## What this is

A scrollytelling explainer. The markup and stylesheet are pasted inline in
the post as a Custom HTML block, so every word is real text in the article
and Discover indexes it normally. Only the animation engine, `flow.js`
(~37 KB, no dependencies), needs to be served as a file.

It has to be a file rather than inline script. Pasted inline it arrived
corrupted every time — `Uncaught SyntaxError: Invalid or unexpected token`
— because post content is filtered and re-encoded on the way to the page,
and one altered character anywhere kills the whole script. A `src`
attribute is not content, so nothing rewrites it.

## What we need

`flow.js` served from the site, and the one `src` in the post's HTML block
pointed at it. Current source of truth:

    https://github.com/eesedla/CPD-discipline-process/blob/main/flow.js

## Suggested placement

Child theme, `js/flow.js`, enqueued only on that post:

```php
add_action( 'wp_enqueue_scripts', function () {
    if ( ! is_singular( 'post' ) || get_the_ID() !== 84759 ) {
        return;
    }
    wp_enqueue_script(
        'cpd-discipline-flow',
        get_stylesheet_directory_uri() . '/js/flow.js',
        array(),
        '2026-10-19',   // bump to bust the cache on any edit
        true            // footer
    );
} );
```

Then delete the `<script src="...">` line from the end of the HTML block,
since the enqueue replaces it.

Head or footer both work — the engine waits for the markup if it is not
there yet. No dependencies, no build step, no jQuery.

## If a plugin is easier than a theme edit

Any "insert scripts" plugin is fine, as long as it loads `flow.js` on that
post. Keep the `<script src>` in the HTML block and just change the URL.

## Notes

- **The media library will not take a `.js` upload** on most WordPress
  configurations, and some setups rename it to `.txt`, which browsers
  refuse to execute. Worth a try, but expect it to need the theme route.
- **Until this is hosted on the site** the post points at jsDelivr, serving
  the file from the GitHub repo above. That works, but it is a third-party
  dependency on page load and it caches for several hours, so edits do not
  appear straight away. Replacing it is the point of this note.
- **If the file fails to load for any reason**, the page detects it and
  falls back to a plain, fully readable version of the explainer. It never
  renders blank. Worth knowing before anyone panics.

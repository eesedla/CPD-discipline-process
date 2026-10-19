# Getting the explainer animating in WordPress

Post 84759, "How Cleveland police discipline works."

## The situation

The explainer's markup and stylesheet are pasted into the post as a Custom
HTML block, so every word is real text in the article and Google Discover
indexes it normally. That part works.

The animation engine cannot go in with them. Pasted inline it arrives
corrupted every time — `Uncaught SyntaxError: Invalid or unexpected token`
— because post content is filtered and re-encoded on its way to the page,
and one altered character anywhere in a script kills all of it. It has to
reach the browser by a route that is not post content.

Three routes below. **Any one of them is enough.** Try them in order; each
needs less from you than the one before, and more from someone else.

---

## 1. Upload the plugin (no developer, ~2 minutes)

`cpd-discipline-flow.zip` in this folder is a complete WordPress plugin.

1. WordPress admin → **Plugins → Add New → Upload Plugin**
2. Choose `cpd-discipline-flow.zip` → **Install Now** → **Activate**
3. Reload the post. It should animate.

It loads the engine only on a post that actually contains the explainer,
found by the explainer's own wrapper class — so there is no post ID to keep
in step, it follows the piece through previews and republishes, and it adds
nothing to any other page on the site.

If **Add New** has no **Upload Plugin** button, plugin installation is
locked down. Go to option 2.

## 2. Code Snippets (no developer, no file hosting)

If the site runs the **Code Snippets** plugin, or anything like it:

1. **Snippets → Add New**
2. Paste all of `wordpress-code-snippet.php`
3. Set it to run on the front end, **Save and Activate**

This carries the whole engine inside PHP. That is inelegant, but PHP output
never passes through the filters that corrupt an inline script, so nothing
can rewrite it — and the page stops depending on an outside server.

## 3. Child theme (needs whoever maintains the theme)

The tidiest long-term home. Put `flow.js` in the child theme at
`js/flow.js` and enqueue it on that post:

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

Head or footer both work: the engine waits for the markup if it is not
there yet. No dependencies, no build step, no jQuery.

---

## After any of them

Delete the `<script src="https://cdn.jsdelivr.net/...">` line from the
bottom of the post's HTML block. Leaving it in does no harm — the engine
refuses to run twice, which is tested — but there is no reason to fetch the
file from an outside server once the site serves it.

## Worth knowing

- **The media library will not take a `.js` upload** on most WordPress
  configurations, and some setups rename it to `.txt`, which browsers
  refuse to execute. Not worth the detour.
- **Until one of these is in place** the post pulls the engine from
  jsDelivr, which serves it from the GitHub repo. That works, but it is an
  outside dependency on every page load and it caches for several hours, so
  edits do not appear straight away.
- **If the engine ever fails to load**, the page notices and falls back to a
  plain, fully readable version of the explainer. It never renders blank.
- **Source of truth** for the engine is `flow.js` in this repo. The copy in
  the plugin and the copy inside the snippet are generated from it, so if it
  changes, they both need regenerating.

<?php
/**
 * Plugin Name: CPD Discipline Flow
 * Description: Serves the scrollytelling explainer for the Cleveland police discipline piece. Loads only on the post that contains it, and nowhere else on the site.
 * Version:     1.5.2
 * Author:      Emma Sedlak
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The explainer's markup and stylesheet are pasted into the post as a
 * Custom HTML block, so the text is part of the article and search engines
 * index it normally. No script goes in with them: post content is filtered
 * and re-encoded on its way to the page, and a single altered character
 * anywhere in a script kills all of it. Everything executable is printed
 * from PHP instead, which nothing rewrites.
 *
 * No post ID to keep in step -- this looks for the explainer's own wrapper
 * in the content, so it follows the post wherever it ends up, including
 * previews and any later republish.
 */
function cpd_discipline_flow_is_target() {
	if ( ! is_singular() ) {
		return false;
	}

	$post = get_post();

	return $post && false !== strpos( $post->post_content, 'viz-container' );
}

/**
 * Runs in the head, before the browser paints anything.
 *
 * This is what hides each beat until the engine reveals it. It has to land
 * before first paint: set any later and the reader sees the whole explainer
 * laid out flat for a moment, then watches it collapse into the scrolling
 * version as the engine starts.
 *
 * It also arms the fallback. If the engine never arrives -- blocked, moved,
 * failed -- the class comes off and the page renders as a plain, fully
 * readable document rather than a blank space.
 */
add_action(
	'wp_head',
	function () {
		if ( ! cpd_discipline_flow_is_target() ) {
			return;
		}

		$boot = <<<'JS'
			/* Set before first paint: the scrolly hides each beat until the engine
			   reveals it, so the hidden state is applied only when scripting is
			   actually available. Without this class the page renders as a plain,
			   fully visible document -- see "Without JavaScript" in the stylesheet.
			
			   The engine drops the class again if it throws. That only helps once
			   the engine has PARSED, though: paste this into a CMS that escapes or
			   strips inline script and the engine never runs at all, leaving every
			   beat hidden and the page apparently empty. So the fallback is armed
			   here instead, and the engine has to say it started. Deliberately free
			   of the characters a CMS is most likely to escape. */
			document.documentElement.classList.add('viz-js');
			// The engine is a separate file. If it fails to load -- blocked, moved,
			// offline -- say so at once rather than leaving the stages blank until
			// the timer below gives up on it.
			window.addEventListener('error', function (e) {
			  var t = e.target;
			  if (t && t.tagName === 'SCRIPT' && !window.vizFlowStarted) {
			    document.documentElement.classList.remove('viz-js');
			  }
			}, true);
			window.setTimeout(function () {
			  if (window.vizFlowStarted) { return; }
			  document.documentElement.classList.remove('viz-js');
			  if (window.console) {
			    window.console.error('discipline flow: the engine never started -- '
			      + 'showing the plain rendering. The inline script was probably '
			      + 'altered or removed in transit.');
			  }
			}, 4000);
JS;

		if ( function_exists( 'wp_print_inline_script_tag' ) ) {
			wp_print_inline_script_tag( $boot );
		} else {
			echo "<script>\n" . $boot . "\n</script>\n";
		}
	},
	1
);

/**
 * Let the site masthead scroll away on this one article.
 *
 * A masthead that stays pinned sits on top of every panel this explainer
 * pins, taking a bite out of each stage for the whole read. Only on this
 * post -- everywhere else on the site it behaves normally.
 *
 * The selectors below cover the usual names. If the masthead on this
 * theme is called something else, add it to the list.
 */
add_action(
	'wp_head',
	function () {
		if ( ! cpd_discipline_flow_is_target() ) {
			return;
		}

		$css = '#masthead, .site-header, .sticky-header, .site-header--sticky {'
			. ' position: static !important; top: auto !important; }';

		if ( function_exists( 'wp_print_inline_style_tag' ) ) {
			wp_print_inline_style_tag( $css );
		} else {
			echo '<style>' . $css . '</style>';
		}
	},
	2
);

/**
 * The engine itself. In the footer, so the markup is already there -- though
 * it copes with the head too, and waits if it has to.
 */
add_action(
	'wp_enqueue_scripts',
	function () {
		if ( ! cpd_discipline_flow_is_target() ) {
			return;
		}

		// Versioned by the file's own timestamp rather than a number typed
		// in here. A hand-kept number goes stale the moment someone forgets
		// to bump it, and then browsers keep serving the engine they already
		// have -- the page looks unchanged and the update seems not to have
		// worked. This way any edit to flow.js busts the cache by itself.
		$engine = plugin_dir_path( __FILE__ ) . 'flow.js';

		wp_enqueue_script(
			'cpd-discipline-flow',
			plugins_url( 'flow.js', __FILE__ ),
			array(),
			file_exists( $engine ) ? (string) filemtime( $engine ) : '1.5.2',
			true
		);
	}
);

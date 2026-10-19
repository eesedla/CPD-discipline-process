<?php
/**
 * Plugin Name: CPD Discipline Flow
 * Description: Serves the scrollytelling engine for the Cleveland police discipline explainer. Loads only on the post that contains the explainer, and nowhere else on the site.
 * Version:     1.0.0
 * Author:      Emma Sedlak
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The explainer's markup and stylesheet are pasted into the post as a
 * Custom HTML block, so the text is part of the article. The engine cannot
 * go in with them: post content is filtered and re-encoded on its way to
 * the page, and a single altered character anywhere in a script kills all
 * of it. Served as a file it is left alone.
 *
 * No post ID to keep in step -- this looks for the explainer's own wrapper
 * in the content, so it follows the post wherever it ends up, including
 * previews and any later republish.
 */
add_action(
	'wp_enqueue_scripts',
	function () {
		if ( ! is_singular() ) {
			return;
		}

		$post = get_post();
		if ( ! $post || false === strpos( $post->post_content, 'viz-container' ) ) {
			return;
		}

		wp_enqueue_script(
			'cpd-discipline-flow',
			plugins_url( 'flow.js', __FILE__ ),
			array(),
			'1.0.0',
			true // Footer. The engine copes with the head too, but the markup is already here.
		);
	}
);

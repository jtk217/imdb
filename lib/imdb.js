var request = require('request'); // module to make http calls
var _ = require('underscore'); // module used as functional library
var htmlparser = require('htmlparser'); // module for parsing html
var select = require('soupselect').select; // module used for css selector support of htmlparser
var debug = require('debug')('imdbjs'); // module used as a debugging utility
var validator = require('validator'); // module used for string validators

var util = {
	titleUrl: function(id) { 
		return 'http://www.imdb.com/title/' + id + '/';
	}
};

// santize and decode html
function htmlDecode (s) {
	return validator.sanitize(s).entityDecode(); 
}

// define the timeout for a request
exports.timeout = 10 * 1000;

module.exports = {
	language: "en-US",

    /**
     * Get general IMDB information about a title by its ID.
     * @function title
     * @param {string} id - The id of the work, as designated by IMDB.
     * @param {titleCallback} callback - The callback that handles the title.
     * @return {titleCallback} callback
     */
	title: function(id, callback) {
		if (_.isNull(callback)) {
			throw new Error('callback not specified');
		}

		if (!id || !/tt\d+/.test(id)) {
			return callback(new Error('invalid imdb id format'));
		}

		var url = util.titleUrl(id); // url of imdb website with appended work id
            
        // submit an http request for the information on the work
		request({ url: url, timeout: exports.timeout, headers: { "Accept-Language": module.exports.language } }, function(err, res, body) {
			if (err) {
				return callback(err);
			}

			if (res.statusCode == 404) {
				return callback(new Error('title not found (404)'));
			}

			if (res.statusCode != 200) {
				return callback(new Error('status code ' + res.statusCode + ' from imdb'));
			}
            
            // create title object to store information on the work
			var title = { 
				id: id,
				name: /itemprop=.name.>\s*([^<]+)/.exec(htmlDecode(body))[1].trim()
			};

			title.rated = /itemprop=.contentRating.\s*content=.([^"]+)"/.exec(htmlDecode(body))[1].trim()

			var m;

			// get year information of the work
			if (m = /span[^>]*>\(<a\s*href="\/year\/(\d{4})\/[^"]*"\s*>\d{4}<\/a>\)<\/span>\s*<\/h1>/.exec(body)) { // year of work is in one year
				title.year = parseInt(m[1]);
			}
			else if (m = /span[^>]*>\(([^–]*)–([^\)]*)\)<\/span>\s*<\/h1>/.exec(body)) { // year of work spans multiple years
				title.year = {
					since: m[1].trim() ? parseInt(m[1].trim()) : null,
					until: m[2].trim() ? parseInt(m[2].trim()) : null
				};
			}

			// get rating and vote count
			m = /title=.Users rated this ([^\/]+).10 \(([^v]+)/.exec(body);

			if (m) {
				title.rating = parseFloat(m[1]);
				title.votes = parseInt(m[2].replace(/[^\d]+/g, ''));
			}

			// get cover image of the work
			if (m = /src=.(h[^"]+).\s*[^<]+itemprop=.image/.exec(body)) {
				title.cover = m[1];
			}

			// get duration of the work
			if (m = /itemprop=.duration[^>]*>\s*([^<]+)\s*</.exec(body)) {
				title.duration = m[1].trim();
			}

			// get languge of the work
			if (m = /Language:<\/h4>\s*<a[^>]*>([^<]+)\s*<\/a>/.exec(body)) {
				title.language = m[1].trim();
			}

			// get what the work is also known as
			if (m = /Also Known As:<\/h4>\s*([^<]+)\s*</.exec(body)) {
				title.aka = m[1].trim();
			}

			// get type of the work
			if (m = /<div class="infobar">\s*([^\n<]+)/.exec(body)) {
				title.type = m[1].trim() || 'Movie';
			}

			// get release date of the work
			if (m = /Release Date:<\/h4>\s*([^<\(]+)[^<]*\s</.exec(body)) {
				title.releasedate = m[1].trim();
			}

			// get awards of the work
			if (m = /itemprop=.awards.>([^<])</.exec(body)) {
				title.awards = m[1].trim();
			}

			// get the number of seasons of the work
			if (m = /href=.\/title\/tt\d+\/episodes\?season=(\d+)/.exec(body)) {
				title.seasons = parseInt(m[1]);
			}

            // determing if there is a tv header in the html
			var tvheader = /<h2\s+class=.tv_header.>\s*<a\s+href=.\/title\/(tt[^\/]+)\/.\s*>\s*([^<]+)<\/a>/.exec(body);

			if (tvheader) {
				title.show = {
					id: tvheader[1],
					name: htmlDecode(tvheader[2]).trim()
				};
			}

			// get season and episode number of the work
			if (m = /<span\sclass=.nobr.>Season\s(\d+), Episode\s(\d+)\s*<\/span>\s*<\/h2/.exec(body)) {
				title.season = parseInt(m[1]);
				title.episode = parseInt(m[2]);
			}

            // parse html for more information
			new htmlparser.Parser(new htmlparser.DefaultHandler(function(err, dom) {
				if (err) return callback(err);

				// get description of the work
				var desc = select(dom, 'p[itemprop="description"]');
				if (desc.length) title.synopsis = htmlDecode(desc[0].children[0].raw.replace(/\n/g, '')).trim();

				// get what genre the work belongs to
				_.each(select(dom, '.infobar a[href^="/genre/"] span'), function(genre) {
					if (!title.genres) title.genres = [];

					title.genres.push(htmlDecode(genre.children[0].raw));					
				});

				// get the cast of the work
				_.each(select(dom, '[itemprop=actor] [itemprop=name]'), function(genre) {
					if (!title.cast) title.cast = [];

					title.cast.push(htmlDecode(genre.children[0].raw));					
				});

				// get the directors of the work
				_.each(select(dom, '[itemprop=director] [itemprop=name]'), function(genre) {
					if (!title.directors) title.directors = [];

					title.directors.push(htmlDecode(genre.children[0].raw));					
				});

				// get the creators of the work
				_.each(select(dom, '[itemprop=creator] [itemprop=name]'), function(genre) {
					if (!title.creators) title.creators = [];

					title.creators.push(htmlDecode(genre.children[0].raw));					
				});

				callback(null, title);
			})).parseComplete(body)
		});
	},
    /**
     * Callback used by the title function.
     * @callback titleCallback
     * @param {Error} err - The error of the callback, if there is one.
     * @param {Object} title - The object storing the title's information.
     */

    /**
     * Get IMDB information about a title's season's episodes by its ID.
     * @function episodes
     * @param {string} id - The id of the work, as designated by IMDB.
     * @param {number} season - The season of the title.
     * @param {episodesCallback} callback - The callback that handles the episodes.
     * @return {episodesCallback} callback
     */
	episodes: function(id, season, callback) {
		if (_.isNull(callback)) {
			throw new Error('callback not specified');
		}

		if (!id || !/tt\d+/.test(id)) {
			return callback(new Error('invalid imdb id format'));
		}

		if (typeof season != 'number' || season == 0 || season < -1) {
			return callback(new Error('invalid season number'));
		}

		var url = util.titleUrl(id) + 'episodes/_ajax?season=' + season; // imdb url with appended id and seasons

        // submit an http request for the information of a work's season's episodes
		request({ url: url, timeout: exports.timeout, headers: { "Accept-Language": module.exports.language } }, function(err, res, body) {
			if (err) {
				return callback(err);
			}

			if (res.statusCode == 500) {
				return callback(new Error('imdb server error, possibly invalid imdb id'));
			}

			if (res.statusCode != 200) {
				return callback(new Error('status code ' + res.statusCode + ' from imdb'));
			}

			var epm = /numberofEpisodes.\s+content=.(\d+)/.exec(body);

			if (!epm) {
				return callback(new Error('response from imdb failed sanity check'));
			}

			var expectedEpisodes = parseInt(epm[1]);
            
            // get episodes
			var m, re = /src="([^"]+)">\s*<div>([^<]+)<\/div>\s*<\/div>\s*<\/a>\s*<\/div>\s*<div[^>]*>\s*<meta\sitemprop=.episodeNumber.\scontent=.(\d+).\/>\s*<div\sclass=.airdate.>\s*([^<]+)\s*<\/div>\s*<strong><a\s(onclick=.[^;]+..\s*)?href=.\/title\/(tt\d+)\/[^>]+>([^<]+)/g;
			var episodes = [];
            
			var convertImdbDate = function(x) {
				var dt = new Date(x);
				var yyyy = dt.getFullYear().toString();
				var mm = (dt.getMonth()+1).toString();
				var dd  = dt.getDate().toString();

   				return yyyy + '-' + (mm[1]?mm:"0"+mm[0]) + '-' + (dd[1]?dd:"0"+dd[0]);
			};			

            // loop through the episodes of the work's season
			while (m = re.exec(body)) {
				var episode = {
					number: parseInt(m[3]),
					id: m[6],
					name: htmlDecode(m[7]).trim(),
					image: m[1],
					title: m[2]
				};

                // if found, get the air date
				if (!/Unknown/.test(m[4])) {
					episode.airDate = convertImdbDate(m[4].trim());
				}

				episodes.push(episode);
			}

            // expected episodes did not match the length of the work's season
			if (expectedEpisodes != episodes.length) {
				return callback(new Error('expected ' + expectedEpisodes + ' and parsed ' + episodes.length));
			}

			callback(null, episodes);
		});
	}
    /**
     * Callback used by the episodes function.
     * @callback episodesCallback
     * @param {Error} err - The error of the callback, if there is one.
     * @param {Object} episodes - The object storing the season's episodes information.
     */
};

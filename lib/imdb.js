var request = require('request');
var _ = require('underscore');
var htmlparser = require('htmlparser');
var select = require('soupselect').select;
var debug = require('debug')('imdbjs');
var validator = require('validator');

var util = {
	titleUrl: function(id) { 
		return 'http://www.imdb.com/title/' + id + '/';
	}
};

function htmlDecode (s) {
	return validator.sanitize(s).entityDecode();
}

exports.timeout = 10 * 1000;

module.exports = {
	language: "en-US",

	title: function(id, callback) {
		if (_.isNull(callback)) {
			throw new Error('callback not specified');
		}

		if (!id || !/tt\d+/.test(id)) {
			return callback(new Error('invalid imdb id format'));
		}

		var url = util.titleUrl(id);

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

			var title = {
				id: id,
				name: /itemprop=.name.>\s*([^<]+)/.exec(htmlDecode(body))[1].trim()
			};

			title.rated = /itemprop=.contentRating.\s*content=.([^"]+)"/.exec(htmlDecode(body))[1].trim()

			var m;

			// Year
			if (m = /span[^>]*>\(<a\s*href="\/year\/(\d{4})\/[^"]*"\s*>\d{4}<\/a>\)<\/span>\s*<\/h1>/.exec(body)) {
				title.year = parseInt(m[1]);
			}
			else if (m = /span[^>]*>\(([^–]*)–([^\)]*)\)<\/span>\s*<\/h1>/.exec(body)) {
				title.year = {
					since: m[1].trim() ? parseInt(m[1].trim()) : null,
					until: m[2].trim() ? parseInt(m[2].trim()) : null
				};
			}

			// Rating and vote count
			m = /title=.Users rated this ([^\/]+).10 \(([^v]+)/.exec(body);

			if (m) {
				title.rating = parseFloat(m[1]);
				title.votes = parseInt(m[2].replace(/[^\d]+/g, ''));
			}

			// Cover
			if (m = /src=.(h[^"]+).\s*[^<]+itemprop=.image/.exec(body)) {
				title.cover = m[1];
			}

			if (m = /itemprop=.duration[^>]*>\s*([^<]+)\s*</.exec(body)) {
				title.duration = m[1].trim();
			}

			if (m = /Language:<\/h4>\s*<a[^>]*>([^<]+)\s*<\/a>/.exec(body)) {
				title.language = m[1].trim();
			}

			if (m = /Also Known As:<\/h4>\s*([^<]+)\s*</.exec(body)) {
				title.aka = m[1].trim();
			}

			if (m = /<div class="infobar">\s*([^\n<]+)/.exec(body)) {
				title.type = m[1].trim() || 'Movie';
			}

			if (m = /Release Date:<\/h4>\s*([^<\(]+)[^<]*\s</.exec(body)) {
				title.releasedate = m[1].trim();
			}

			if (m = /itemprop=.awards.>([^<])</.exec(body)) {
				title.awards = m[1].trim();
			}

			// The first match is conveniently the most recent (highest number) season.
			if (m = /href=.\/title\/tt\d+\/episodes\?season=(\d+)/.exec(body)) {
				title.seasons = parseInt(m[1]);
			}

			var tvheader = /<h2\s+class=.tv_header.>\s*<a\s+href=.\/title\/(tt[^\/]+)\/.\s*>\s*([^<]+)<\/a>/.exec(body);

			if (tvheader) {
				title.show = {
					id: tvheader[1],
					name: htmlDecode(tvheader[2]).trim()
				};
			}

			// Season and episode number.
			if (m = /<span\sclass=.nobr.>Season\s(\d+), Episode\s(\d+)\s*<\/span>\s*<\/h2/.exec(body)) {
				title.season = parseInt(m[1]);
				title.episode = parseInt(m[2]);
			}

			// Hardcore
			new htmlparser.Parser(new htmlparser.DefaultHandler(function(err, dom) {
				if (err) return callback(err);

				// Description
				var desc = select(dom, 'p[itemprop="description"]');
				if (desc.length) title.synopsis = htmlDecode(desc[0].children[0].raw.replace(/\n/g, '')).trim();

				// Genres
				_.each(select(dom, '.infobar a[href^="/genre/"] span'), function(genre) {
					if (!title.genres) title.genres = [];

					title.genres.push(htmlDecode(genre.children[0].raw));					
				});

				// Cast
				_.each(select(dom, '[itemprop=actor] [itemprop=name]'), function(genre) {
					if (!title.cast) title.cast = [];

					title.cast.push(htmlDecode(genre.children[0].raw));					
				});

				// Directors
				_.each(select(dom, '[itemprop=director] [itemprop=name]'), function(genre) {
					if (!title.directors) title.directors = [];

					title.directors.push(htmlDecode(genre.children[0].raw));					
				});

				// Creators
				_.each(select(dom, '[itemprop=creator] [itemprop=name]'), function(genre) {
					if (!title.creators) title.creators = [];

					title.creators.push(htmlDecode(genre.children[0].raw));					
				});

				callback(null, title);
			})).parseComplete(body)
		});
	},

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

		var url = util.titleUrl(id) + 'episodes/_ajax?season=' + season;

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

			var m, re = /src="([^"]+)">\s*<div>([^<]+)<\/div>\s*<\/div>\s*<\/a>\s*<\/div>\s*<div[^>]*>\s*<meta\sitemprop=.episodeNumber.\scontent=.(\d+).\/>\s*<div\sclass=.airdate.>\s*([^<]+)\s*<\/div>\s*<strong><a\s(onclick=.[^;]+..\s*)?href=.\/title\/(tt\d+)\/[^>]+>([^<]+)/g;
			var episodes = [];

			var convertImdbDate = function(x) {
				var dt = new Date(x);
				var yyyy = dt.getFullYear().toString();
				var mm = (dt.getMonth()+1).toString();
				var dd  = dt.getDate().toString();

   				return yyyy + '-' + (mm[1]?mm:"0"+mm[0]) + '-' + (dd[1]?dd:"0"+dd[0]);
			};			

			while (m = re.exec(body)) {
				var episode = {
					number: parseInt(m[3]),
					id: m[6],
					name: htmlDecode(m[7]).trim(),
					image: m[1],
					title: m[2]
				};

				if (!/Unknown/.test(m[4])) {
					episode.airDate = convertImdbDate(m[4].trim());
				}

				episodes.push(episode);
			}

			if (expectedEpisodes != episodes.length) {
				return callback(new Error('expected ' + expectedEpisodes + ' and parsed ' + episodes.length));
			}

			callback(null, episodes);
		});
	}
};

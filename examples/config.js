exports.config = {
	// Block namespace: all block names must begin with a prefix, e.g. myblock:stairs_granite. This must be unique, but short. Do not include a colon. For more info, see
	prefix: 'hubgen',

	// Input options
	// Configure template file locations
	// All template files can be relocated to a subfolder, e.g. presets: 'config/presets.json',
	input: {
		// List of block permutation definition files (array). Can also be supplied with command line arguments
		// All template files must begin with 'blocks-'
		// Use blocks-*.json to automatically include all files that begin with 'blocks-'. Other wildcards are not supported.
		// Example: [ 'blocks-roofs.json', 'blocks-walls.json',  'blocks-vslabs.json' ]
		blocks: [ 'blocks-*.json' ],

		// Collection of code snippets that can be included in blocks
		presets: 'presets.json',

		// Scaffolding for all block files
		scaffolding: 'scaffolding.json',
	},

	// Output options
	// Configure output options
	output: {
		// Output directory, relative to root
		outputDir: 'output',

		// Name and title separators
		// Configure separators between different permutation segments
		// Define how permutation names and titles should be put together
		// Makes reading block lists easier
		// Use with the 'type' directive, e.g. 'type': 'typeName'
		// Type can be any string, except '*' and 'material'
		// Name separator constrains => valid: [ .()-_ ], invalid: [  space,+,; ]
		// Example output: vslab.centred--width_medium(stonebrick)
		nameSeparators: { '*': '.', size: '--', material: [ '(', ')' ] },
		titleSeparators: { '*': ' - ', material: [ ' (', ') ' ] },

		// Create directory structure for block files based on X segments of the block permutation path (nesting levels)
		// E.g. [pathSegmentation: 2]
		// vslab.thick.align_centre.acacia ==> vslab/thick/align_centre_acacia.json
		pathSegmentation: 4,

		// Save generated block titles to this translation file
		language: 'en_US',
	},

}

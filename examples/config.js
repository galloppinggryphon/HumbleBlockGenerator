export default {
	// # Block namespace #
	// All block names must begin with a prefix, e.g. myblock:stairs_granite
	// Prevent block name conflicts with other addons.
	// The namespace must be unique, but short. Do not include a colon.
	prefix: 'hubgen',

	// = Namespace prefix for geometry models =
	// Choose a prefix to automatically prepend to all geometry model names.
	// Prevent model name conflicts with other addons.
	// E.g. Prefix 'hubgen__' and geometry: 'model_name' ==> geometry: 'geometry.hubgen__model_name'
	// Do not include the required 'geometry.' prefix, it is added automatically.
	// Leave blank to skip prefix or to set it manually in the template files.
	geometryPrefix: 'hubgen__',

	// # Input options #
	// Configure template file locations
	// All template files can be relocated to a subfolder, e.g. presets: 'config/presets.json',
	input: {
		// = Location of block template files =
		// It's recommended to use a sub-directory
		blockConfigDir: 'config',

		// = List of block permutation definition files (array). Can also be supplied with command line arguments =
		// All template files must begin with 'blocks-'
		// Use blocks-*.json to automatically include all files that begin with 'blocks-'. Other wildcards are not supported.
		// Example: [ 'blocks-roofs.json', 'blocks-walls.json',  'blocks-vslabs.json' ]
		blocks: [ 'blocks-*.json' ],

		// = Collection of code snippets that can be included in blocks =
		presets: 'presets.json',

		// = Scaffolding for all block files =
		scaffolding: 'scaffolding.json',
	},

	// # Output options #
	// Configure block naming and output paths
	output: {
		// = Output directory, relative to root =
		outputDir: 'output',

		// = Allow outputDir to be outside current working directory =
		allowOutputOutsideCwd: false,

		// = Name and title separators =
		// Configure separators between different permutation segments
		// Define how permutation names and titles should be put together
		// Makes reading block lists easier
		// Use with the 'type' directive, e.g. 'type': 'typeName'
		// Type can be any string, except '*' and 'material'
		// Name separator constrains => valid: [ .()-_ ], invalid: [  space,+,; ]
		// Example output: vslab.centred--width_medium(stonebrick)
		nameSeparators: {
			'*': '.',
			size: '--',
			material: [ '(', ')' ],
		},
		titleSeparators: {
			'*': ' - ',
			material: [ ' (', ') ' ],
		},

		// = Directory structure for block files =
		// Sort block files by creating folder for segments of the permutation path (nesting levels) =
		// Choose the number of segments to use.
		// E.g. the first two segments: [pathSegmentation: 2]
		// vslab.thick.align_centre.acacia ==> vslab/thick/align_centre_acacia.json
		pathSegmentation: 4,

		// = Save generated block titles to this translation file =
		language: 'en_US',
	},

}

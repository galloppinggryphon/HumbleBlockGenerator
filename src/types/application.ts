declare namespace Application {
	interface AppData {
		uninitialized: boolean;
		generatorData: {
			output: {
				basePath: string;
				baseDir: string;
				outputDir: string
				paths: JSO<string>;
			};
			input: {
				blockConfigPath: string;
				blocks: JSO<string>;
				blockFiles: string[];
			};
			presetScripts: JSO;
			presets: JSO;
			materialConfig: JSO;
			scaffolding: JSO;
		};

		scriptArgs: JSO;
		settings: AppSettings;
		paths: {
			defaultConfigDir: string;
			configDir: string;
			configPath: string;
			rootPath: string;
			templateDir: string;
			templatePath: string;
		};
	}

	type AppSettings = UserConfig & {}

	/**
	 * #Todo  use in config file
	 */
	interface UserConfig {
		/**
		 * # Block namespace #
		 *
		 * All block names must begin with a prefix, e.g. myblock:stairs_granite
		 * Prevent block name conflicts with other addons.
		 * The namespace must be unique, but short. Do not include a colon.
		 */
		prefix: string;

		propertyPrefix: string;

		/**
		 * # Namespace prefix for geometry models #
		 *
		 * Choose a prefix to automatically prepend to all geometry model names.
		 * Prevent model name conflicts with other addons.
		 * E.g. Prefix 'hubgen__' + geometry 'model_name' ==> geometry: 'geometry.hubgen__model_name'
		 * Do not include the 'geometry.' prefix, it is added automatically.
		 * Leave blank to skip prefix or to set it manually in the template files.
		 */
		geometryPrefix: string;

		/**
		 * # Input options #
		 *
		 * Configure template file locations
		 * All template files can be relocated to a subfolder, e.g. presets: 'config/presets.json'
		 */
		input: {
			/**
			 * # Location of block template files #
			 *
			 * It's recommended to use a sub-directory
			 */
			blockConfigDir: string;

			// !! Use this
			blocksX: {
				dir: string;
				files: string[];
			};

			/**
			 * = List of block permutation definition files (array). Can also be supplied with command line arguments =
			 *
			 * All template files must begin with 'blocks-'
			 * Use blocks-*.json to automatically include all files that begin with 'blocks-'. Other wildcards are not supported.
			 * Example: [ 'blocks-roofs.json', 'blocks-walls.json',  'blocks-vslabs.json' ]
			 */
			blocks: string[]; // [ 'blocks-arches.json', 'blocks-blocks.jsonx' ],

			materials: string;

			// = Models =
			modelConfig: string;
			modelFileDir: string;

			// = Collection of code snippets that can be included in blocks =
			presets: string;
			presetScripts: string;

			// = Scaffolding for final block files =
			scaffolding: string;
		};

		/**
		 * # Output options #
		 *
		 * Configure block naming and output paths
		 */
		output: {
			// = Output directory, relative to root =
			// outputDir: '../hubgen-output',
			outputDir: string;

			allowOutputOutsideConfigDir: boolean;

			// = Name and title separators =
			// Configure separators between different permutation segments
			// Define how permutation names and titles should be put together
			// Makes reading block lists easier
			// Use with the 'type' directive, e.g. 'type': 'typeName'
			// Type can be any string, except '*' and 'material'
			// Name separator constrains => valid: [ .()-_ ], invalid: [  space,+,; ]
			// Example output: vslab.centred--width_medium(stonebrick)
			nameSeparators: any
			// {
			// 	"*": ".";
			// 	size: "--";
			// 	material: ["(", ")"];
			// };
			titleSeparators: any
			// {
			// 	"*": " - ";
			// 	material: [" (", ") "];
			// };

			nameTemplate: {
				default: string
				material: string
			};

			titleTemplate: {
				default: string
				material: string
			};

			// = Directory structure for block files =
			// Sort block files by creating folder for segments of the permutation path (nesting levels) =
			// Choose the number of segments to use.
			// E.g. the first two segments: [pathSegmentation: 2]
			// vslab.thick.align_centre.acacia ==> vslab/thick/align_centre_acacia.json
			pathSegmentation: number; // todo: rename folder_depth

			// = Save generated block titles to this translation file =
			language: string;
		};
	}
}

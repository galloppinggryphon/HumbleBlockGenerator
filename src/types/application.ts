declare namespace Application {
	interface AppData {
		uninitialized: boolean;
		generatorData: {
			output: {
				basePath: string;
				baseDir: string;
				paths: JSO<string>;
			};
			input: {
				blockConfigPath: "";
				blocks: JSO<string>;
				blockFiles: string[];
			};
			presetScripts: JSO<string>;
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

	interface AppSettings extends UserConfig {
		geometryPrefix: string;
		prefix: string;
	}

	/**
	 * #Todo  use in config file
	 */
	interface UserConfig {
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
	}
}

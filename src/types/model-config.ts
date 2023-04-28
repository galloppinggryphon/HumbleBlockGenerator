declare namespace ModelConfig {
	interface Config {
		[category: string]: ConfigItem[];
	}

	interface ConfigItem {
		export_base?: boolean;
		files: {
			/** File: model name */
			[file: string]: string;
		};
		templates: Templates;
		models: Models;
	}

	type x = { models; export_base; templates };

	interface Templates {
		[key: string]: Template;
	}

	interface Template {
		[variant: string]: string[];
	}

	interface Models {
		/** Variant: bones */
		[variant: string]: string[];
	}

	interface GeneratorProps {
		modelData: JSO;
		templates: JSO;
		data?: {
			bones: string[];
			name: string[];
		};
	}

	interface GeneratorStats {
		models: number;
		file_errors: number;
		model_errors: any[];
	}
}

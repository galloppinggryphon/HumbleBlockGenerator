
declare namespace Materials {
	type MaterialInstance = {
		texture: string;
		render_method?: string;
		ambient_occlusion?: boolean;
		face_dimming?: boolean;
	};

	type MaterialInstanceCollection = {
		[materialInstanceKey: string]: Materials.MaterialInstance;
	};

	type MaterialTemplate = {
		title?: string;
		texture?: string;
		render_method?: string;
		ambient_occlusion?: boolean;
		face_dimming?: boolean;
	};

	type MaterialTemplates = {
		[materialKey: string]: MaterialTemplate;
	};

	type MaterialPermutationCollection = {
		[permutationKey: string]: MaterialInstanceCollection;
	};

	type MaterialPermutationStore = {
		[permutationKey: string]: MaterialStoreItem;
	};

	type MaterialStoreItem = {
		title: string;
		materialInstances: MaterialInstanceCollection;
	};

	type MaterialFilter = string[];
	type MaterialInstanceFilter = string[];

	interface MaterialBuilderData {
		render: {};
		/**
		 * Base data.
		 */
		materialTemplates: MaterialTemplates;

		/**
		 * Exports.
		 */
		materials: MaterialPermutationStore;

		/**
		 * Temp data.
		 */
		materialPermutations: MaterialPermutationStore;
	}

	/**
	 * Material builder factory.
	 */
	type MaterialBuilder = {
		data: MaterialBuilderData;
		/**
		 * Parse template data and extract materials.
		 */
		extractMaterials(templateData: BlockTemplateData): void;
		generatePermutations(): void;
	};
}

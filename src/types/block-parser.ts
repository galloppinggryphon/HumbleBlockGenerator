
declare namespace BlockParser {
	/**
	 * Block parser methods.
	 */
	interface PermutationBuilderHandlers {
		readonly permutations: PermutationTreeData;

		/**
		 * Reference to the proxy MaterialBuilder
		 */
		materials: Materials.MaterialBuilder;

		mergeProps(obj: JSO): void;
		isValid(): boolean;
		setPermutationData({ key, title, type }: PermutationInfo): void;
		hasPermutations(): boolean;
		getPermutations(): [string, JSO][];
		newPermutation(
			permutationKey: string,
			blockTemplate: JSO
		): PermutationBuilder;
		createBlock(): GeneratedBlockData;
		exportdata(): any;
		newMaterialPermutation(
			name: string,
			materials: BlockTemplateData
		): PermutationBuilder;
		disablePermutation(): void;
		mergeTemplateData(templateData: BlockTemplateData): void;
		mergePresetSettings(dir: JSO): void;
		eachMaterialPermutation(): PermutationBuilder[];
		parseMaterials(): void;
	}

	/**
	 * Block parser public proxy data and methods.
	 */
	interface PermutationBuilderPublicProxyInterface {
		export(): PermutationBuilder;
		copyPermutationData(): PermutationBuilder;
		data: PermutationData;
		children: JSO;
	}

	/**
	 * Block parser.
	 */
	type PermutationBuilder = PermutationBuilderPublicProxyInterface &
		PermutationBuilderHandlers;

	interface PermutationBuilderProxy
		extends PermutationBuilderPublicProxyInterface {
		/**
		 * Permutation methods
		 */
		handlers: PermutationBuilderHandlers;

		/**
		 * MaterialBuilder factory
		 */
		materials: Materials.MaterialBuilder;
	}

	// interface CreateBlock.Block {
	// 	readonly data: CreateBlockData;
	// 	readonly permutationInfo: PermutationInfoHandler;
	// 	addEvent( eventTemplate: EventTemplate ): void;
	// 	addMinecraftPermutation( condition: string, props: JSO ): void;
	// 	addMaterialInstances( newInstances: any ): void;
	// 	addPartVisibility( materialInstanceName: string, conditions: string[] ): void;
	// 	addProperty( key: string, values: any ): void;
	// 	make(): GeneratedBlockData;
	// }
}

declare namespace Block {

}

interface GeneratedBlockData {
	source: BlockTemplateData;
	block: JSO; // Props( data.props ),
	identifier: string;
	title: string;
	permutationData: {
		data: PermutationInfo[];
		path: string[];
	};
}


interface BlockTemplateData {
	dir?: JSO;
	props: PropsProxy<Props>;
	static?: JSO;
	tags?: JSO;
	templateStrings?: JSO;
	variants?: JSO;
	vars?: JSO;
}

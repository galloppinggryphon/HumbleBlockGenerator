declare namespace CreateBlock {
	interface Block {
		readonly data: CreateBlock.Data;
		readonly permutationInfo: PermutationTreeData;
		addEvent(eventData: Events.EventData): void;
		addMinecraftPermutation(condition: string, props: JSO): void;
		addMaterialInstances(newInstances: any): void;
		addPartVisibility(
			materialInstanceName: string,
			conditions: string[]
		): void;
		addState(key: string, values: any): void;
		make(prepareFinalBlock?: boolean): GeneratedBlockData;
	}

	interface Data {
		boneVisibility?: JSO;
		blockInfo: Partial<CreateBlock.BlockInfo>;
		source: BlockTemplateData;
		extraVars: CreateBlock.ExtraVars;
		props: JSO;
		permutations: MinecraftPermutationData;
		eventTriggers: JSO<Events.EventTriggerComponent>;
		eventHandlers: JSO<Events.EventActionSequence>;
	}

	interface ExtraVars {
		prefix: string;
		permutation: string;
		variant: string;
		material: string;
		blockName: string;
	}

	type BlockInfo = {
		key: string;
		name: string;
		fullName: string;
		finalPermutation: string;
	};

	type MinecraftPermutationData = {
		[condition: string]: any;
	};

	type BlockCompiler = {
		readonly block: Block;
		addStaticProps(): void;
		addTags(): void;
		compatibilityCheck(props: JSO): void;
		filterEmpty(): void;
		prefixComponentProps(): void;
		compile(): void;
		newCompiler(blockData: JSO): BlockCompiler;
		propParsers: PropParsers;
		directiveParsers: PropParsers;
		parseCollisionBox(source: JSO, propertyKey: string);
	};
}

// BlockTemplateData( permutationProps )

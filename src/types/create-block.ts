
declare namespace CreateBlock {
	interface Block {
		readonly data: CreateBlock.Data;
		readonly permutationInfo: PermutationTreeData;
		addEvent(eventTemplate: Events.EventData): void;
		addMinecraftPermutation(condition: string, props: JSO): void;
		addMaterialInstances(newInstances: any): void;
		addBoneVisibility(
			materialInstanceName: string,
			conditions: string[]
		): void;
		addProperty(key: string, values: any): void;
		make(): GeneratedBlockData;
	}

	interface Data {
		blockInfo: BlockInfo;
		source: BlockTemplateData;
		extraVars: ExtraVars;
		props: JSO;
		permutations: MinecraftPermutationStore;
		eventTriggers: JSO<Events.EventTriggerComponent>;
		eventHandlers: JSO<Events.ActionSequence>;
	}

	type BlockInfo = {
		key: string;
		name: string;
		fullName: string;
		finalPermutation: string;
	};

	type MinecraftPermutationStore = {
		[condition: string]: any;
	};
}

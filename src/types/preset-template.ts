declare namespace PresetTemplate {
	interface TemplateData {
		[x: string]: any;
		states: JSO<number[] | false>;
		/**
		 * e.g. { event: { "on_interact.handler": "...", "on_interact.trigger_items": { [string]: "..." } } }
		 */
		events: EventTriggers;
		event_handlers: EventHandlers;
		// permutation_templates: PermutationTemplate[];
		permutation_data: JSO<PermutationDataItem>
		part_visibility: JSO;
		part_visibility_template: string;
		bone_visibility: JSO;
	}

	type PermutationDataItem = false | {
		permutations: JSO | false,
		template: PermutationTemplate
	}

	//PermutationItemData[]

	type EventHandlers = {
		[eventHandlerName: string]: Events.EventHandler;
	};

	type EventTriggers = {
		[eventTriggerName: string]: Events.EventTrigger;
	};

	interface PermutationProps {
		block_props?: JSO;
		condition?: string;
	}

	/**
	 * Internal data used by preset parser to generate MC permutations.
	 */
	interface PermutationTemplate extends PermutationProps {
		conditionalConditions?: JSO<string>;
		condition?: string
		params?: JSO;
		for_each?: string;
		key?: string;
	}
}

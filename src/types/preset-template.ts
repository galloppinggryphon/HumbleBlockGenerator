declare namespace PresetTemplate {
	interface TemplateData {
		[x: string]: any;
		properties: JSO<number[] | false>;
		/**
		 * e.g. { event: { "on_interact.handler": "...", "on_interact.trigger_items": { [string]: "..." } } }
		 */
		events: JSO<Events.EventTriggerItemTemplate>;
		event_handler_templates: EventHandlerTemplates;
		permutation_templates: PermutationItemData[];
		// part_visibility_template: string;
		permutations: JSO;
		bone_visibility: JSO;
	}

	type EventHandlerTemplates = {
		[eventHandlerName: string]: Events.EventHandlerItemTemplate;
	};

	type EventTriggers = {
		[eventTriggerName: string]: Events.EventTriggerItemTemplate;
	};

	interface PermutationProps {
		block_props: JSO;
		condition?: string;
	}

	/**
	 * Internal data used by preset parser to generate MC permutations.
	 */
	interface PermutationItemData extends PermutationProps {
		conditionalConditions?: JSO<string>;
		params?: JSO;
		for_each?: string;
		key?: string;
	}
}

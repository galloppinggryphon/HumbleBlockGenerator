declare namespace Events {
	interface EventData {
		/**
		 * Event handler actions
		 *
		 * Valid event types: @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockevents/blockeventlist
		 */
		action?: Presets.ComponentData[];
		/** Action execution filter (Molang expression(s)) */
		condition?: string | string[];
		/**
		 * Minecraft event trigger.
		 *
		 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blocktriggers/blocktriggerlist
		 */
		eventName?: string;
		/** Name of event handler */
		handler?: string;
		/** Properties, variables to use with event_handler_templates  */
		params?: JSO;
		/** Event target, e.g. `self` or `player` */
		target?: string;
	}

	interface EventParserData extends EventData {
		condition?: string
	}

	/** Event handler item used in preset event_handler_templates key */
	interface EventHandler
		extends Pick<Events.EventData, "action" | "condition"> {}

	/** Event trigger item used in preset events key: condition, handler, target, propertyNames, triggerItems */
	interface EventTrigger
		extends Pick<
			Events.EventData,
			| "action"
			| "condition"
			| "handler"
			| "params"
			| "target"
		> {}

	/** Event trigger data used in block component */
	interface EventTriggerComponent
		extends Pick<Events.EventData, "condition" | "handler" | "target"> {}

	/** Used by block templates */
	interface EventDirectiveItem
		extends CombineTwo<
			EventHandler,
			Pick<
				Events.EventData,
				"eventName" | "handler" | "target" | "action" | "params"
			>
		> {}

	/** Used by block templates */
	interface EventDirectives {
		[eventHandlerName: string]: EventDirectiveItem | Presets.ComponentData[];
	}

	type EventActionSequence = {
		sequence: Presets.ComponentData[];
	};

}

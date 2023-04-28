declare namespace Events {
	// interface EventsDirectiveItem extends Pick<EventData, "condition"|"handler"|"target"|"action"|"eventTrigger"> {}

	interface EventData {
		/**
		 * Event handler actions
		 *
		 * @see Valid event types: https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockevents/blockeventlist
		 */
		action?: Events.ActionItem[]; // | Events.ActionSequence;
		/** Action execution filter (Molang expression) */
		condition?: string;
		/**
		 * Minecraft event trigger.
		 *
		 * @see https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blocktriggers/blocktriggerlist
		 */
		eventName?: string;
		/** Name of event handler */
		handler?: string;
		/** Properties, variables to use with event_handler_templates  */
		// event_handler_params?: JSO;
		eventHandlerParams?: JSO;

		params?: JSO;
		/** List of properties to use with event */
		// propertyNames?: string | string[];
		/** Event target, e.g. `self` or `player` */
		target?: string;
		/** Condition to use with event trigger */
		triggerCondition?: string;
		/** Items that can trigger this event {Key: ItemName} */
		// triggerItems?: JSO<string>;
	}

	/** Event handler item used in preset event_handler_templates key */
	interface EventHandlerItemTemplate
		extends Pick<Events.EventData, "action" | "triggerCondition"> {}

	/** Event trigger item used in preset events key: condition, handler, target, propertyNames, triggerItems */
	interface EventTriggerItemTemplate
		extends Pick<
			Events.EventData,
			| "action"
			| "condition"
			| "handler"
			// | "propertyNames"
			// | "triggerItems"
			| "target"
		> {}

	/** Event trigger data used in block component */
	interface EventTriggerComponent
		extends Pick<Events.EventData, "condition" | "handler" | "target"> {}

	/** Used by block templates */
	interface EventDirectiveItem
		extends CombineTwo<
			EventHandlerItemTemplate,
			Pick<
				Events.EventData,
				"handler" | "target" | "action"
			>
		> {}

	/** Used by block templates */
	interface EventDirectives {
		[eventHandlerName: string]: EventDirectiveItem | Events.ActionItem[];
	}

	type ActionSequence = {
		sequence: Events.ActionItem[];
	};

	type ActionItem = {
		forEach?: string;
		for_each?: string;
		params?: JSO;
	} & {
		[action: string]: string;
		condition?: string;
	};
}

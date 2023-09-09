type MagicExpressionMatch = {
	divider: string;
	dynamic_key: string;
	expression: string;
	preset_property: string;
	sub_key: string;
};

type ExpressionMeta = {
	isMagicExpression: boolean;
	property: string;
	path?: string[];
	dynamicProperty?: any;
	magicExpression?: string;
	operation?: string;
	metaKey?: string;
	variable?: string;
	notFound?: boolean
}


type MagicExpressionKeyData = {
	key?: string;
	magic_key?: string;
	name?: string;
	current_block_state?: string;
};

interface MagicExpressionData extends MagicExpressionKeyData {
	[propertyName: string]: any;
	current_value?: string | number;
	key?: string,
	keys?: string[];
	key_list?: string;
	is_main_hand?: string;
	length?: number;
	max?: number;
	min?: number;
	// combine?: string;
	value?: string | string[] | number | number[];
	value_list?: string;
}

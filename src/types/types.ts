interface Props {
	[x: string]: any;
	components?: JSO;
	description?: JSO;
	events?: JSO;
	permutations?: JSO[];
}

type PropsProxy<Props> = Props & {
	filterEmpty(): Props;
	export(): Props;
};

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

interface PropParsers {
	[propName: string]: (block: CreateBlock.Block) => CreateBlock.Block;
}

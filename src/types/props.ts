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

interface PropParsers {
	[propName: string]: (block: CreateBlock.Block) => CreateBlock.Block;
}

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

type PropParsers = {
	[propName: string]: (compiler: CreateBlock.BlockCompiler) => CreateBlock.BlockCompiler
}

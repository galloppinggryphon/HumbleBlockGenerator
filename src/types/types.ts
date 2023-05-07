type Coordinates = [x: number, y: number, z: number];

/**
 * e: east, w: west, n: north, s: south, t: top, bottom: bottom
 */
type UnitCubeTransformAnchors =
	| "wbs"
	| "wbn"
	| "wts"
	| "wtn"
	| "ebs"
	| "ebn"
	| "etn"
	| "ets";

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

interface PermutationTreeData {
	readonly data: PermutationInfo[];
	readonly path: string[];
	getFinalPermution(includeMaterialPermutations?: boolean): string;
}

interface PermutationInfo {
	key: string;
	title?: string;
	type?: "material" | "default";
}

/**
 * Block parser data.
 */
interface PermutationData {
	/**
	 * Template data (parsed input)
	 */
	block: BlockTemplateData;

	/**
	 * ?? All permutations created so far??
	 */
	permutationInfo: PermutationInfo[];

	/**
	 * Materials to use for this permutation tree.
	 */
	materialPermutations: BlockParser.PermutationBuilder[];

	/**
	 * Data about the current permutation in the loop.
	 */
	currentPermutation: {
		isValid: boolean;
		key: string;
		name: string;
		fullName: string;
	};
}

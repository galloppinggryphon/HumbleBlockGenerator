declare namespace Permutations {

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

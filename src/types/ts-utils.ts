type JSO<T extends any = any> = Record<string, T>;

type CombineTwo<A, B> = A & B;

/**
 * Filter missing types/arguments when passed on from another utility type. Returns never if required type argument is missing.
 */
type FilterMissingTypeArg<Val> = ValueOf<Val> extends never
	? never
	: Unwrap<Val>;

	/**
 * Unwrap aliased types or types wrapped in other types, exposing their members directly.
 *
 * @see https://www.typescriptlang.org/docs/handbook/release-notes/typescript-2-8.html#type-inference-in-conditional-types
 */
type Unwrap<Source> = Source extends infer Parent
? { [Key in keyof Parent]: Parent[Key] }
: never;

/**
 * Get value of Type.
 */
type ValueOf<Type> = Type[keyof Type];

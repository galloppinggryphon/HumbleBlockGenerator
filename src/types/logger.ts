type LogItem = {
	level: number;
	levelStr: string;
	context: string;
	label: string;
	msg: string;
	line?: string;
	file?: string;
	column?: string;
	stacktrace?: string;
	additionalData: string;
};

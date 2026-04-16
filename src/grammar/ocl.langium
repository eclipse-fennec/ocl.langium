grammar Ocl

entry OclDocument:
    (contexts+=ContextDeclaration)*;

// ============================================================
// Context Declarations
// ============================================================

// Disambiguation via lookahead after QualifiedName:
//   '(' -> OperationContext
//   ':' ID/keyword (not 'inv') -> PropertyContext
//   'inv' -> ClassifierContext
ContextDeclaration:
    OperationContext | PropertyContext | ClassifierContext | CoclContext;

ClassifierContext:
    'context' type=QualifiedName
    (constraints+=ClassifierConstraint)+;

ClassifierConstraint:
    InvariantConstraint | DefExpression;

InvariantConstraint:
    'inv' (name=ID)? ':' expression=Expression;

// OCL §4.7 — def: expressions define helper attributes and operations
// Attribute form:  def: name : Type = expr
// Operation form:  def: name(params) : Type = expr
DefExpression:
    'def' ':' name=ID
    (
        // Operation form: has parenthesized parameters
        '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')' ':' returnType=TypeExpression '=' body=Expression
        // Attribute form: just type and expression
        | ':' type=TypeExpression '=' body=Expression
    );

// path contains "Type::operation" as a single qualified name
OperationContext:
    'context' path=QualifiedName
    '(' (parameters+=Parameter (',' parameters+=Parameter)*)? ')'
    (':' returnType=TypeExpression)?
    (conditions+=OperationCondition)+;

OperationCondition:
    PreCondition | PostCondition | BodyCondition;

PreCondition:
    'pre' (name=ID)? ':' expression=Expression;

PostCondition:
    'post' (name=ID)? ':' expression=Expression;

BodyCondition:
    'body' (name=ID)? ':' expression=Expression;

// path contains "Type::property" as a single qualified name
PropertyContext:
    'context' path=QualifiedName ':' propertyType=TypeExpression
    (constraints+=PropertyConstraint)+;

PropertyConstraint:
    DeriveConstraint | InitConstraint;

DeriveConstraint:
    'derive' ':' expression=Expression;

InitConstraint:
    'init' ':' expression=Expression;

// C-OCL (Custom OCL) contexts
// path contains "Type::name" as a single qualified name
CoclContext:
    CoclValidation | CoclDerived | CoclReferenceFilter;

CoclValidation:
    'VALIDATION' path=QualifiedName
    expression=Expression;

CoclDerived:
    'DERIVED' path=QualifiedName
    expression=Expression;

CoclReferenceFilter:
    'REFERENCE_FILTER' path=QualifiedName
    expression=Expression;

// ============================================================
// Parameters & Types
// ============================================================

Parameter:
    name=ID ':' type=TypeExpression;

TypeExpression:
    CollectionType | TupleType | SimpleType;

SimpleType:
    name=QualifiedName;

CollectionType:
    kind=CollectionKind '(' elementType=TypeExpression ')';

TupleType:
    'Tuple' '(' (parts+=TupleTypePart (',' parts+=TupleTypePart)*)? ')';

TupleTypePart:
    name=ID ':' type=TypeExpression;

CollectionKind returns string:
    'Set' | 'OrderedSet' | 'Bag' | 'Sequence' | 'Collection';

// ============================================================
// Expressions (precedence: low to high)
// ============================================================

Expression:
    LetExpression | IfExpression | ImpliesExpression;

// let x : Type = expr in body
LetExpression:
    'let' name=ID (':' type=TypeExpression)? '=' value=Expression 'in' body=Expression;

// if cond then expr else expr endif
IfExpression:
    'if' condition=Expression 'then' thenExpression=Expression
    'else' elseExpression=Expression 'endif';

// implies, xor
ImpliesExpression infers Expression:
    OrExpression ({infer BinaryExpression.left=current} op=('implies' | 'xor') right=OrExpression)*;

// or
OrExpression infers Expression:
    AndExpression ({infer BinaryExpression.left=current} op='or' right=AndExpression)*;

// and
AndExpression infers Expression:
    NotExpression ({infer BinaryExpression.left=current} op='and' right=NotExpression)*;

// not (unary prefix)
NotExpression infers Expression:
    {infer UnaryExpression} op='not' operand=NotExpression
    | ComparisonExpression;

// =, <>, <, >, <=, >=
ComparisonExpression infers Expression:
    AdditiveExpression ({infer BinaryExpression.left=current} op=('=' | '<>' | '<' | '>' | '<=' | '>=') right=AdditiveExpression)*;

// +, -
AdditiveExpression infers Expression:
    MultiplicativeExpression ({infer BinaryExpression.left=current} op=('+' | '-') right=MultiplicativeExpression)*;

// *, /, div, mod
MultiplicativeExpression infers Expression:
    UnaryMinusExpression ({infer BinaryExpression.left=current} op=('*' | '/' | 'div' | 'mod') right=UnaryMinusExpression)*;

// unary minus
UnaryMinusExpression infers Expression:
    {infer UnaryExpression} op='-' operand=UnaryMinusExpression
    | NavigationExpression;

// ============================================================
// Navigation & Method Calls
// ============================================================

NavigationExpression infers Expression:
    PrimaryExpression (
        // Arrow operations: ->op(...)
        {infer ArrowExpression.source=current} '->' operation=ID '(' (arguments+=IteratorBody | arguments+=Expression (',' arguments+=Expression)*)? ')'
        // Dot navigation: .feature or .operation(...)
        | {infer DotExpression.source=current} '.' feature=ID ('(' (arguments+=Expression (',' arguments+=Expression)*)? ')')?
    )*;

// Iterator body for collection operations: x | expr  or  x : Type | expr
IteratorBody:
    iteratorName=ID (':' iteratorType=TypeExpression)? (',' iteratorName2=ID (':' iteratorType2=TypeExpression)?)? '|' body=Expression;

// ============================================================
// Primary Expressions
// ============================================================

PrimaryExpression infers Expression:
    ParenthesizedExpression
    | CollectionLiteral
    | TupleLiteral
    | TypeExpLiteral
    | SelfExpression
    | VariableExpression
    | IntegerLiteral
    | RealLiteral
    | StringLiteral
    | BooleanLiteral
    | NullLiteral
    | InvalidLiteral;

ParenthesizedExpression infers Expression:
    '(' Expression ')';

// self
SelfExpression:
    {infer SelfExpression} 'self';

// variable or enum literal or class reference
VariableExpression:
    name=QualifiedName;

// Integer literal
IntegerLiteral:
    value=INT;

// Real literal
RealLiteral:
    value=REAL;

// String literal
StringLiteral:
    value=STRING;

// Boolean literal
BooleanLiteral:
    value=('true' | 'false');

// null
NullLiteral:
    {infer NullLiteral} 'null';

// invalid
InvalidLiteral:
    {infer InvalidLiteral} 'invalid';

// ============================================================
// Collection & Tuple Literals
// ============================================================

CollectionLiteral:
    kind=CollectionKind '{' (items+=CollectionItem (',' items+=CollectionItem)*)? '}';

CollectionItem:
    first=Expression ('..' last=Expression)?;

TupleLiteral:
    'Tuple' '{' (parts+=TuplePart (',' parts+=TuplePart)*)? '}';

TuplePart:
    name=ID ('=' | ':') value=Expression;

// Type expression used as expression: Type.allInstances() etc.
TypeExpLiteral:
    type=QualifiedName '::' feature=ID;

// ============================================================
// Qualified Name (for package::Class etc.)
// ============================================================

QualifiedName returns string:
    ID ('::' ID)*;

// ============================================================
// Terminals
// ============================================================

hidden terminal WS: /\s+/;
hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /--[^\n\r]*/;

terminal REAL returns number: /[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?/;
terminal INT returns number: /[0-9]+/;
terminal STRING: /'[^']*'/;
terminal ID: /[a-zA-Z_][a-zA-Z0-9_]*/;

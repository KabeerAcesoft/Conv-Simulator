// Lightweight local plugin that adds a single rule: optional-chaining/optional-chaining-autofix
// It auto-fixes member access like obj.prop -> obj?.prop when the object's type includes undefined/null.
// ⚠️ Use with care; read limitations below.
// Created by Dmytro Vakulenko (2025), v1.0.0
//
// Limitations/notes:
// - Only works in TypeScript files (requires @typescript-eslint/parser)
// - Only works when type information is available (parserOptions.project must be set)
// - By default, only handles simple member access (obj.prop). You can disable this by
//   setting the option `onlySimpleMember: false`, but be cautious as it may produce invalid code in complex cases.
// - Does NOT handle calls like obj.fn() -> obj?.fn?.() to avoid changing
//   "this" binding semantics. You can add this manually after the member access is fixed.
// - Does NOT handle identifiers like fn() -> fn?.() to avoid changing "this"
//   binding semantics. You can add this manually after the member access is fixed.
// - Does NOT handle left-hand assignment targets (obj.prop = value) as changing
//   to optional chaining there is invalid syntax.
// - May produce invalid code if the member access is part of a larger expression
//   that assumes non-null receiver (e.g., obj.prop + 1 when obj could be null).
//   Review all changes before committing.
// - May produce invalid code if the member access is in a context that
//   requires non-null (e.g., function call arguments, return statements).
import { ESLintUtils } from '@typescript-eslint/utils';
import ts from 'typescript';

const createRule = ESLintUtils.RuleCreator(() => 'local');

function isSideEffectFreeMemberChain(node) {
  if (!node) return false;

  if (node.type === 'Identifier' || node.type === 'ThisExpression') return true;

  if (node.type === 'MemberExpression') {
    if (node.computed) return false;

    return (
      isSideEffectFreeMemberChain(node.object) &&
      node.property.type === 'Identifier'
    );
  }

  return false;
}

function renderMemberText(sourceCode, node) {
  return sourceCode.getText(node);
}

function renderAndGuardChain(sourceCode, node) {
  // For chain a.b.c -> "a && a.b && a.b.c"
  if (node.type === 'Identifier' || node.type === 'ThisExpression') {
    return renderMemberText(sourceCode, node);
  }

  if (node.type === 'MemberExpression' && !node.computed) {
    const left = renderAndGuardChain(sourceCode, node.object);

    const here =
      renderMemberText(sourceCode, node.object) + '.' + node.property.name;

    return `${left} && ${here}`;
  }

  // Fallback (shouldn't normally happen with onlySimpleMember=true)
  return renderMemberText(sourceCode, node);
}

function getTopmostMemberOnLHS(member) {
  // Climb as long as parent is a MemberExpression and we are its .object
  let top = member;

  while (
    top.parent &&
    top.parent.type === 'MemberExpression' &&
    top.parent.object === top
  ) {
    top = top.parent;
  }

  // Now check if top is the actual LHS of = or argument of ++/--
  const p = top.parent;

  if (!p) return { isLHS: false, topmost: null };

  if (p.type === 'AssignmentExpression' && p.left === top) {
    return { isLHS: true, topmost: top };
  }

  if (p.type === 'UpdateExpression' && p.argument === top) {
    return { isLHS: true, topmost: top };
  }

  return { isLHS: false, topmost: null };
}

export default {
  rules: {
    'optional-chaining-autofix': createRule({
      name: 'optional-chaining-autofix',
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Insert optional chaining for safe reads; wrap LHS updates/assignments with a null-guard.',
          recommended: false,
        },
        fixable: 'code',
        schema: [
          {
            type: 'object',
            properties: {
              includeNull: { type: 'boolean', default: true },
              includeUndefined: { type: 'boolean', default: true },
              onlySimpleMember: { type: 'boolean', default: true },
              guardUpdatesAndAssignments: { type: 'boolean', default: true },
            },
            additionalProperties: false,
          },
        ],
        messages: {
          makeOptional:
            'Receiver may be null/undefined; inserting optional chaining.',
          guardLHS:
            'Left-hand side may be null/undefined; wrapping the statement with a guard.',
        },
      },
      defaultOptions: [
        {
          includeNull: true,
          includeUndefined: true,
          onlySimpleMember: true,
          guardUpdatesAndAssignments: true,
        },
      ],
      create(context, [options]) {
        const sourceCode = context.sourceCode;
        const parserServices = ESLintUtils.getParserServices(context);
        const checker = parserServices.program.getTypeChecker();

        function includesNullish(tsType) {
          if (!tsType) return false;

          const isNullish = (tp) =>
            !!(tp.flags & ts.TypeFlags.Undefined) ||
            !!(tp.flags & ts.TypeFlags.Null);

          if (tsType.isUnion()) return tsType.types.some(isNullish);

          return isNullish(tsType);
        }

        function isAlreadyOptional(member) {
          if (member.optional) return true;

          const parent = member.parent;

          return parent && parent.type === 'ChainExpression';
        }

        function visitMember(member) {
          // Respect setting: only dot members by default
          if (member.computed && options.onlySimpleMember) return;

          // Determine LHS context and topmost LHS member
          const { isLHS, topmost } = getTopmostMemberOnLHS(member);

          // Map to TS node to check types on the receiver (the .object)
          const tsObject = parserServices.esTreeNodeToTSNodeMap.get(
            member.object,
          );

          if (!tsObject) return;

          const tsType = checker.getTypeAtLocation(tsObject);
          const considerUndefined = options.includeUndefined;
          const considerNull = options.includeNull;

          // Short-circuit: if receiver type doesn't include the chosen nullish kinds, bail.
          const hasNullish =
            (considerUndefined &&
              (tsType.isUnion()
                ? tsType.types.some((t) => !!(t.flags & ts.TypeFlags.Undefined))
                : !!(tsType.flags & ts.TypeFlags.Undefined))) ||
            (considerNull &&
              (tsType.isUnion()
                ? tsType.types.some((t) => !!(t.flags & ts.TypeFlags.Null))
                : !!(tsType.flags & ts.TypeFlags.Null)));

          if (!hasNullish) return;

          // If we are inside an LHS chain:
          if (isLHS) {
            // Only the OUTERMOST LHS member should act; inner members must do nothing.
            if (member !== topmost) return;

            if (!options.guardUpdatesAndAssignments) return;

            // Ensure we can safely duplicate the member.object chain and that the whole statement is an ExpressionStatement
            const expr = topmost.parent; // AssignmentExpression | UpdateExpression
            const stmt = expr?.parent;

            if (!stmt || stmt.type !== 'ExpressionStatement') return;

            if (!isSideEffectFreeMemberChain(topmost.object)) return;

            const guard = renderAndGuardChain(sourceCode, topmost.object);
            const originalStmt = sourceCode.getText(stmt).replace(/;?\s*$/, '');
            const fixed = `if (${guard}) ${originalStmt};`;

            context.report({
              node: topmost,
              messageId: 'guardLHS',
              fix(fixer) {
                return fixer.replaceText(stmt, fixed);
              },
            });

            return;
          }

          // Non-LHS case: apply dot -> ?.
          if (isAlreadyOptional(member)) return;

          // Find the '.' token between object and property
          const dotToken = sourceCode.getTokenAfter(member.object, {
            includeComments: false,
          });

          if (!dotToken || dotToken.value !== '.') return;

          context.report({
            node: member,
            messageId: 'makeOptional',
            fix(fixer) {
              return fixer.replaceText(dotToken, '?.');
            },
          });
        }

        return { MemberExpression: visitMember };
      },
    }),
  },
};

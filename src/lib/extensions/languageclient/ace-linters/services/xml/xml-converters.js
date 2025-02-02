import { DiagnosticSeverity, Range } from "vscode-languageserver-protocol";
import { checkValueAgainstRegexpArray } from "../../utils";
import { CommonConverter } from "../../type-converters/common-converters";
export function lexingErrorsToDiagnostic(errors, document, filterErrors) {
    return CommonConverter.excludeByErrorMessage(errors, filterErrors.errorMessagesToIgnore).map((el) => {
        return {
            message: el.message,
            range: Range.create(document.positionAt(el.offset), document.positionAt(el.offset + el.length)),
            severity: determineDiagnosticSeverity(el.message, filterErrors, el.severity),
        };
    });
}
export function parsingErrorsToDiagnostic(errors, document, filterErrors) {
    return CommonConverter.excludeByErrorMessage(errors, filterErrors.errorMessagesToIgnore).map((el) => {
        return {
            message: el.message,
            range: Range.create(document.positionAt(el.token.startOffset), document.positionAt(el.token.endOffset ?? 0)),
            severity: determineDiagnosticSeverity(el.message, filterErrors, el.severity),
        };
    });
}
export function issuesToDiagnostic(errors, document, filterErrors) {
    return CommonConverter.excludeByErrorMessage(errors, filterErrors.errorMessagesToIgnore, "msg").map((el) => {
        return {
            message: el.msg,
            range: {
                start: document.positionAt(el.position.startOffset),
                end: document.positionAt(el.position.endOffset + 1),
            },
            severity: determineDiagnosticSeverity(el.msg, filterErrors, el.severity),
        };
    });
}
function toDiagnosticSeverity(issueSeverity) {
    if (!issueSeverity)
        return DiagnosticSeverity.Error;
    switch (issueSeverity) {
        case "error":
            return DiagnosticSeverity.Error;
        case "warning":
            return DiagnosticSeverity.Warning;
        case "info":
        default:
            return DiagnosticSeverity.Information;
    }
}
function determineDiagnosticSeverity(message, filterErrors, issueSeverity) {
    let severity;
    if (checkValueAgainstRegexpArray(message, filterErrors.errorMessagesToTreatAsWarning)) {
        severity = DiagnosticSeverity.Warning;
    }
    else if (checkValueAgainstRegexpArray(message, filterErrors.errorMessagesToTreatAsInfo)) {
        severity = DiagnosticSeverity.Information;
    }
    else {
        severity = toDiagnosticSeverity(issueSeverity);
    }
    return severity;
}

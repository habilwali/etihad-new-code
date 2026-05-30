<?php
/**
 * Dining / venues API — serves JSON from `dining.json` next to this file.
 * Deploy both files to your CMS host under `/api/` (same origin as other PHP APIs).
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$path = __DIR__ . DIRECTORY_SEPARATOR . 'dining.json';
if (!is_readable($path)) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'dining.json not found next to dining.php',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$raw = file_get_contents($path);
if ($raw === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not read dining.json'], JSON_UNESCAPED_UNICODE);
    exit;
}

echo $raw;

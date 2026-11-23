rule BlueKit_Demo : demo bluekit {
  meta:
    author = "BlueKit tests"
    description = "Fixture for the YARA-X integration test"
    score = 7
  strings:
    $text = "BlueKit" ascii wide
    $hex = { 42 6c 75 65 }
    $re = /phase-[0-9]+/
  condition:
    all of them
}

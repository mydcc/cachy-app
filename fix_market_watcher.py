import re

file_path = 'src/services/marketWatcher.ts'

with open(file_path, 'r') as f:
    content = f.read()

# Pattern to fix:
#     try {
#     if (!this.isPolling) return;
#
#     try {

# We want to remove the first 'try {' and the subsequent 'if ...' line if it's duplicated.
# Actually, the original code had:
# if (!this.isPolling) return;
# try {
# ...

# My previous replacement inserted:
# if (!this.isPolling) return;
# ...
# try {

# So we have:
# [New Code]
# if (!this.isPolling) return;
# ...
# try {
# [Old Code]
# if (!this.isPolling) return;
# try {

# We want to keep [New Code] but remove the  I added, AND remove the [Old Code] ?
# No, wait.
# If I remove the  I added, then the  block starts later.
# But  logic is *outside* the original .
# The original  wraps .
# This is fine.  calculation doesn't need to be in .

# So I should remove:
# 1. The  I added.
# 2. The  from the *old* code (since I added it in new code).

# Pattern:
pattern = r'    try \{\s+    if \(!this\.isPolling\) return;\s+    try \{'
replacement = '    try {'

# Wait, if I replace with , I am effectively merging the two s?
# No.
# If I have:
# try {
#    if (...) return;
#    try {

# If I replace with , I get:
# try {
# ...

# But I want:
# if (...) return; (New one is already there)
# try { (Original one)

# So I want to remove the *first*  and the *second* .

# Let's see the text again:
#     try {
#     if (!this.isPolling) return;
#
#     try {

# I want to remove the first  and the  line.
# Leaving just the second .

# But wait, my previous replacement ADDED  at the end of .
# So I should just remove that  from the string I inserted?
# But the file is already written.

# Correct fix:
# Search for:
#     try {
#     if (!this.isPolling) return;
#
#     try {

# Replace with:
#     if (!this.isPolling) return;
#     try {

# Wait,  already has  at the top.
# So if I remove the intermediate ones, I'm good.

# The pattern in the file likely looks like:
# ...
#     } else if (idleMonitor.isUserIdle) {
#         nextTick = 5000;
#     }
#
#     try {
#     if (!this.isPolling) return;
#
#     try {

# I want to change this block to:
# ...
#     } else if (idleMonitor.isUserIdle) {
#         nextTick = 5000;
#     }
#
#     // (Removed extra try and if)
#     try {

pattern = r'    try \{\n    if \(!this\.isPolling\) return;\n\n    try \{'
replacement = '    try {'

# Let's try to match loosely with whitespace
content = re.sub(r'try\s*\{\s*if\s*\(!this\.isPolling\)\s*return;\s*try\s*\{', 'try {', content)

# But wait, if I do that,  is defined, then .
# And inside  we have the rest of original code.
# The original code started with .
# So:
# try {
#   await this.performPollingCycle();
# ...

# This seems correct.

with open(file_path, 'w') as f:
    f.write(content)

print("Fixed marketWatcher.ts")

from conan import ConanFile

class BoostConan(ConanFile):
    name = "boost"
    version = "1.84.0"
    description = "Boost provides free peer-reviewed portable C++ source libraries"
    license = "BSL-1.0"
    url = "https://www.boost.org"
    topics = ("boost", "libraries", "cpp")

    def requirements(self):
        self.requires("zlib/1.3.1")

    def package_info(self):
        self.cpp_info.libs = ["boost_system", "boost_filesystem"]
